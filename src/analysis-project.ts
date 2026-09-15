import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import type { AnalysisProxySettings } from "./analysis-proxy.js";
import type { AnalysisScores, FrameComponentScore } from "./analysis-score.js";
import { classifyBoundaries, type ClassifiedBoundary } from "./boundary-classifier.js";
import { buildExposureSpans, type ExposureTimeline } from "./exposure-span.js";
import { classificationSettingsForSensitivity } from "./analysis-sensitivity.js";

export interface PartialAnalysisSnapshot {
  readonly sourceFingerprint: string;
  readonly proxySettings: AnalysisProxySettings;
  readonly frameCount: number;
  readonly boundaries: readonly FrameComponentScore[];
}

export interface CompletedAnalysisSnapshot {
  readonly scores: AnalysisScores;
  readonly timeline: ExposureTimeline;
  readonly sensitivity: number;
}

export interface AnalysisProjectMatch {
  readonly sourceFingerprint: string;
  readonly proxySettings: AnalysisProxySettings;
  readonly frameCount: number;
}

export interface ResolvedAnalysisSnapshot {
  readonly snapshot: CompletedAnalysisSnapshot;
  readonly loadedFromSidecar: boolean;
}

export class AnalysisProject {
  readonly path: string;

  constructor(sourcePath: string) {
    if (sourcePath.length === 0) throw new Error("A source path is required for the analysis project");
    this.path = `${sourcePath}.animstudy`;
  }

  savePartial(snapshot: PartialAnalysisSnapshot): void {
    validatePartialSnapshot(snapshot);
    this.#save({
      status: "partial",
      sourceFingerprint: snapshot.sourceFingerprint,
      proxySettings: snapshot.proxySettings,
      classificationSettings: null,
      sensitivity: null,
      frameCount: snapshot.frameCount,
      boundaries: snapshot.boundaries,
      classifiedBoundaries: null,
      timeline: null,
    });
  }

  saveCompleted(snapshot: CompletedAnalysisSnapshot): void {
    validateCompletedSnapshot(snapshot);
    const classified = classifyBoundaries(
      snapshot.scores,
      snapshot.timeline.classificationSettings,
    );
    const expectedTimeline = buildExposureSpans(classified);
    if (
      JSON.stringify(expectedTimeline.spans) !== JSON.stringify(snapshot.timeline.spans) ||
      JSON.stringify(expectedTimeline.reviewBoundaries) !== JSON.stringify(snapshot.timeline.reviewBoundaries)
    ) throw new Error("Completed exposure spans must match the saved boundary classifications");
    this.#save({
      status: "completed",
      sourceFingerprint: snapshot.scores.sourceFingerprint,
      proxySettings: snapshot.scores.settings,
      classificationSettings: snapshot.timeline.classificationSettings,
      sensitivity: snapshot.sensitivity,
      frameCount: snapshot.scores.frameCount,
      boundaries: snapshot.scores.boundaries,
      classifiedBoundaries: classified.boundaries,
      timeline: snapshot.timeline,
    });
  }

  loadCompleted(expected: AnalysisProjectMatch): CompletedAnalysisSnapshot | null {
    if (!existsSync(this.path)) return null;
    const database = new DatabaseSync(this.path, { readOnly: true });
    try {
      const state = database.prepare(`
        SELECT status, source_fingerprint, proxy_settings_json,
          classification_settings_json, sensitivity, frame_count,
          completed_boundary_count
        FROM analysis_state WHERE id = 1
      `).get();
      if (!state || state.status !== "completed") return null;
      if (
        state.source_fingerprint !== expected.sourceFingerprint ||
        state.proxy_settings_json !== JSON.stringify(expected.proxySettings) ||
        state.frame_count !== expected.frameCount
      ) return null;

      const classificationSettings = parseClassificationSettings(
        state.classification_settings_json,
      );
      const sensitivity = requiredInteger(state.sensitivity, "analysis sensitivity");
      const boundaryRows = database.prepare(`
        SELECT from_timeline_position, to_timeline_position,
          luma_difference, chroma_difference, edge_difference,
          strongest_difference, classification, needs_review
        FROM boundary_scores ORDER BY from_timeline_position
      `).all();
      if (
        state.completed_boundary_count !== expected.frameCount - 1 ||
        boundaryRows.length !== expected.frameCount - 1
      ) throw new Error("The completed analysis has an incomplete boundary set");

      const boundaries = boundaryRows.map((row): FrameComponentScore => ({
        fromTimelinePosition: requiredInteger(row.from_timeline_position, "boundary start"),
        toTimelinePosition: requiredInteger(row.to_timeline_position, "boundary end"),
        lumaDifference: requiredNumber(row.luma_difference, "luma difference"),
        chromaDifference: requiredNumber(row.chroma_difference, "chroma difference"),
        edgeDifference: requiredNumber(row.edge_difference, "edge difference"),
      }));
      const scores: AnalysisScores = {
        schemaVersion: 1,
        sourceFingerprint: expected.sourceFingerprint,
        settings: expected.proxySettings,
        frameCount: expected.frameCount,
        boundaries,
      };
      const classified = classifyBoundaries(scores, classificationSettings);
      const timeline = buildExposureSpans(classified);
      validateStoredClassifications(boundaryRows, classified.boundaries);
      validateStoredExposures(database, timeline);
      const snapshot = { scores, timeline, sensitivity };
      validateCompletedSnapshot(snapshot);
      return snapshot;
    } catch (error) {
      throw new Error("Could not load the completed analysis sidecar", { cause: error });
    } finally {
      database.close();
    }
  }

  async loadCompletedOrAnalyze(
    expected: AnalysisProjectMatch,
    analyze: () => Promise<CompletedAnalysisSnapshot>,
  ): Promise<ResolvedAnalysisSnapshot> {
    const saved = this.loadCompleted(expected);
    if (saved) return { snapshot: saved, loadedFromSidecar: true };

    const snapshot = await analyze();
    if (
      snapshot.scores.sourceFingerprint !== expected.sourceFingerprint ||
      snapshot.scores.frameCount !== expected.frameCount ||
      JSON.stringify(snapshot.scores.settings) !== JSON.stringify(expected.proxySettings)
    ) throw new Error("New analysis does not match the requested source");
    this.saveCompleted(snapshot);
    return { snapshot, loadedFromSidecar: false };
  }

  #save(snapshot: StoredSnapshot): void {
    const database = new DatabaseSync(this.path);
    try {
      createSchema(database);
      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare(`
          INSERT INTO analysis_state (
            id, status, source_fingerprint, proxy_settings_json,
            classification_settings_json, sensitivity, frame_count,
            completed_boundary_count, updated_at
          ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            source_fingerprint = excluded.source_fingerprint,
            proxy_settings_json = excluded.proxy_settings_json,
            classification_settings_json = excluded.classification_settings_json,
            sensitivity = excluded.sensitivity,
            frame_count = excluded.frame_count,
            completed_boundary_count = excluded.completed_boundary_count,
            updated_at = excluded.updated_at
        `).run(
          snapshot.status,
          snapshot.sourceFingerprint,
          JSON.stringify(snapshot.proxySettings),
          snapshot.classificationSettings === null
            ? null
            : JSON.stringify(snapshot.classificationSettings),
          snapshot.sensitivity,
          snapshot.frameCount,
          snapshot.boundaries.length,
          new Date().toISOString(),
        );

        database.exec("DELETE FROM boundary_scores; DELETE FROM exposures");
        const insertBoundary = database.prepare(`
          INSERT INTO boundary_scores (
            from_timeline_position, to_timeline_position,
            luma_difference, chroma_difference, edge_difference,
            strongest_difference, classification, needs_review
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const boundary of snapshot.boundaries) {
          const classified = snapshot.classifiedBoundaries?.[boundary.fromTimelinePosition];
          insertBoundary.run(
            boundary.fromTimelinePosition,
            boundary.toTimelinePosition,
            boundary.lumaDifference,
            boundary.chromaDifference,
            boundary.edgeDifference,
            classified?.strongestDifference ?? null,
            classified?.classification ?? null,
            classified?.classification === "uncertain" ? 1 : 0,
          );
        }

        if (snapshot.timeline) {
          const insertExposure = database.prepare(`
            INSERT INTO exposures (
              id, exposure_index, display_cel_number, start_timeline_position,
              end_timeline_position, frame_count, representative_timeline_position
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          for (const span of snapshot.timeline.spans) {
            insertExposure.run(
              span.id,
              span.exposureIndex,
              span.displayCelNumber,
              span.startTimelinePosition,
              span.endTimelinePosition,
              span.frameCount,
              span.representativeTimelinePosition,
            );
          }
        }
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      database.close();
    }
  }
}

interface StoredSnapshot {
  readonly status: "partial" | "completed";
  readonly sourceFingerprint: string;
  readonly proxySettings: AnalysisProxySettings;
  readonly classificationSettings: ExposureTimeline["classificationSettings"] | null;
  readonly sensitivity: number | null;
  readonly frameCount: number;
  readonly boundaries: readonly FrameComponentScore[];
  readonly classifiedBoundaries: readonly ClassifiedBoundary[] | null;
  readonly timeline: ExposureTimeline | null;
}

function createSchema(database: DatabaseSync): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS analysis_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL CHECK (status IN ('partial', 'completed')),
      source_fingerprint TEXT NOT NULL,
      proxy_settings_json TEXT NOT NULL,
      classification_settings_json TEXT,
      sensitivity INTEGER,
      frame_count INTEGER NOT NULL CHECK (frame_count > 0),
      completed_boundary_count INTEGER NOT NULL CHECK (completed_boundary_count >= 0),
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS boundary_scores (
      from_timeline_position INTEGER PRIMARY KEY,
      to_timeline_position INTEGER NOT NULL,
      luma_difference REAL NOT NULL,
      chroma_difference REAL NOT NULL,
      edge_difference REAL NOT NULL,
      strongest_difference REAL,
      classification TEXT CHECK (classification IN ('same', 'uncertain', 'changed')),
      needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS exposures (
      id TEXT PRIMARY KEY,
      exposure_index INTEGER NOT NULL UNIQUE,
      display_cel_number INTEGER NOT NULL,
      start_timeline_position INTEGER NOT NULL,
      end_timeline_position INTEGER NOT NULL,
      frame_count INTEGER NOT NULL,
      representative_timeline_position INTEGER NOT NULL
    ) STRICT;
  `);
}

function parseClassificationSettings(value: unknown): ExposureTimeline["classificationSettings"] {
  if (typeof value !== "string") throw new Error("The completed analysis has no classification settings");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error("The completed analysis has invalid classification settings", { cause: error });
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The completed analysis has invalid classification settings");
  }
  const settings = parsed as Record<string, unknown>;
  return {
    sameThreshold: requiredNumber(settings.sameThreshold, "same threshold"),
    changedThreshold: requiredNumber(settings.changedThreshold, "changed threshold"),
  };
}

function validateStoredClassifications(
  rows: readonly Record<string, unknown>[],
  boundaries: readonly ClassifiedBoundary[],
): void {
  rows.forEach((row, index) => {
    const expected = boundaries[index]!;
    if (
      row.strongest_difference !== expected.strongestDifference ||
      row.classification !== expected.classification ||
      row.needs_review !== (expected.classification === "uncertain" ? 1 : 0)
    ) throw new Error(`Saved classification ${index} does not match its component scores`);
  });
}

function validateStoredExposures(database: DatabaseSync, timeline: ExposureTimeline): void {
  const rows = database.prepare(`
    SELECT id, exposure_index, display_cel_number, start_timeline_position,
      end_timeline_position, frame_count, representative_timeline_position
    FROM exposures ORDER BY exposure_index
  `).all();
  const stored = rows.map((row) => ({
    id: row.id,
    exposureIndex: row.exposure_index,
    displayCelNumber: row.display_cel_number,
    startTimelinePosition: row.start_timeline_position,
    endTimelinePosition: row.end_timeline_position,
    frameCount: row.frame_count,
    representativeTimelinePosition: row.representative_timeline_position,
  }));
  if (JSON.stringify(stored) !== JSON.stringify(timeline.spans)) {
    throw new Error("Saved exposures do not match the boundary classifications");
  }
}

function requiredNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`The saved ${name} must be a finite number`);
  }
  return value;
}

function requiredInteger(value: unknown, name: string): number {
  const number = requiredNumber(value, name);
  if (!Number.isSafeInteger(number)) throw new Error(`The saved ${name} must be an integer`);
  return number;
}

function validatePartialSnapshot(snapshot: PartialAnalysisSnapshot): void {
  if (snapshot.sourceFingerprint.length === 0) throw new Error("The source fingerprint is required");
  if (!Number.isSafeInteger(snapshot.frameCount) || snapshot.frameCount < 1) {
    throw new Error("Analysis frame count must be a positive integer");
  }
  if (snapshot.boundaries.length >= snapshot.frameCount) {
    throw new Error("A partial analysis cannot contain every source boundary");
  }
  validateBoundaryPrefix(snapshot.boundaries);
}

function validateCompletedSnapshot(snapshot: CompletedAnalysisSnapshot): void {
  if (snapshot.scores.boundaries.length !== snapshot.scores.frameCount - 1) {
    throw new Error("A completed analysis must contain every source boundary");
  }
  if (
    snapshot.timeline.sourceFingerprint !== snapshot.scores.sourceFingerprint ||
    snapshot.timeline.frameCount !== snapshot.scores.frameCount ||
    JSON.stringify(snapshot.timeline.proxySettings) !== JSON.stringify(snapshot.scores.settings)
  ) throw new Error("Completed scores and exposure timeline must describe the same source");
  if (!Number.isSafeInteger(snapshot.sensitivity) || snapshot.sensitivity < 0 || snapshot.sensitivity > 100) {
    throw new Error("Analysis sensitivity must be an integer from 0 through 100");
  }
  if (
    JSON.stringify(classificationSettingsForSensitivity(snapshot.sensitivity)) !==
    JSON.stringify(snapshot.timeline.classificationSettings)
  ) throw new Error("Completed classification settings must match the analysis sensitivity");
  validateBoundaryPrefix(snapshot.scores.boundaries);
}

function validateBoundaryPrefix(boundaries: readonly FrameComponentScore[]): void {
  boundaries.forEach((boundary, index) => {
    if (boundary.fromTimelinePosition !== index || boundary.toTimelinePosition !== index + 1) {
      throw new Error("Saved analysis boundaries must form a chronological prefix");
    }
    if (
      !isNormalized(boundary.lumaDifference) ||
      !isNormalized(boundary.chromaDifference) ||
      !isNormalized(boundary.edgeDifference)
    ) throw new Error("Saved component differences must be finite values from 0 through 1");
  });
}

function isNormalized(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

import { DatabaseSync } from "node:sqlite";
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

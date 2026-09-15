import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AnalysisProject } from "../src/analysis-project.js";
import type { AnalysisScores, FrameComponentScore } from "../src/analysis-score.js";
import { classifyBoundaries } from "../src/boundary-classifier.js";
import { buildExposureSpans } from "../src/exposure-span.js";
import { applyExposureCorrection } from "../src/exposure-correction.js";
import { normalizeTiming } from "../src/timing.js";

test("saves partial and completed analysis snapshots to a SQLite sidecar", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "animation-study-project-test-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const sourcePath = join(directory, "fixture video.mp4");
  const project = new AnalysisProject(sourcePath);
  const scores = fixtureScores();
  const timing = fixtureTiming();

  project.saveSource(timing, scores.sourceFingerprint);

  project.savePartial({
    sourceFingerprint: scores.sourceFingerprint,
    proxySettings: scores.settings,
    frameCount: scores.frameCount,
    boundaries: scores.boundaries.slice(0, 1),
  });
  const expected = {
    sourceFingerprint: scores.sourceFingerprint,
    proxySettings: scores.settings,
    frameCount: scores.frameCount,
  };
  assert.equal(project.loadCompleted(expected), null);

  assert.equal(project.path, `${sourcePath}.animstudy`);
  assert.equal((await readFile(project.path)).subarray(0, 16).toString(), "SQLite format 3\0");
  let database = new DatabaseSync(project.path, { readOnly: true });
  assert.deepEqual({ ...database.prepare(`
    SELECT status, frame_count, completed_boundary_count, classification_settings_json, sensitivity
    FROM analysis_state WHERE id = 1
  `).get() }, {
    status: "partial",
    frame_count: 3,
    completed_boundary_count: 1,
    classification_settings_json: null,
    sensitivity: null,
  });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM boundary_scores").get()!.count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM exposures").get()!.count, 0);
  assert.deepEqual({ ...database.prepare(`
    SELECT source_path, source_fingerprint, frame_count, stream_json, container_json
    FROM source_metadata WHERE id = 1
  `).get() }, {
    source_path: sourcePath,
    source_fingerprint: scores.sourceFingerprint,
    frame_count: 3,
    stream_json: JSON.stringify(timing.stream),
    container_json: JSON.stringify(timing.container),
  });
  assert.deepEqual(database.prepare(`
    SELECT timeline_position, presentation_timestamp_numerator,
      presentation_timestamp_denominator, presentation_duration_numerator,
      presentation_duration_denominator, duration_source
    FROM source_frames ORDER BY timeline_position
  `).all().map((row) => ({ ...row })), [
    {
      timeline_position: 0,
      presentation_timestamp_numerator: "0",
      presentation_timestamp_denominator: "1",
      presentation_duration_numerator: "1",
      presentation_duration_denominator: "24",
      duration_source: "packet",
    },
    {
      timeline_position: 1,
      presentation_timestamp_numerator: "1",
      presentation_timestamp_denominator: "24",
      presentation_duration_numerator: "1",
      presentation_duration_denominator: "24",
      duration_source: "packet",
    },
    {
      timeline_position: 2,
      presentation_timestamp_numerator: "1",
      presentation_timestamp_denominator: "12",
      presentation_duration_numerator: "1",
      presentation_duration_denominator: "24",
      duration_source: "packet",
    },
  ]);
  database.close();

  const timeline = buildExposureSpans(classifyBoundaries(scores));
  project.saveCompleted({ scores, timeline, sensitivity: 50 });

  let analysisRunCount = 0;
  const resolved = await project.loadCompletedOrAnalyze(expected, async () => {
    analysisRunCount += 1;
    return { scores, timeline, sensitivity: 50 };
  });
  assert.equal(analysisRunCount, 0);
  assert.equal(resolved.loadedFromSidecar, true);
  assert.deepEqual(resolved.snapshot, { scores, timeline, sensitivity: 50 });
  assert.equal(project.loadCompleted({ ...expected, sourceFingerprint: "different-source" }), null);

  database = new DatabaseSync(project.path, { readOnly: true });
  assert.deepEqual({ ...database.prepare(`
    SELECT status, frame_count, completed_boundary_count, sensitivity
    FROM analysis_state WHERE id = 1
  `).get() }, {
    status: "completed",
    frame_count: 3,
    completed_boundary_count: 2,
    sensitivity: 50,
  });
  assert.deepEqual(database.prepare(`
    SELECT from_timeline_position, strongest_difference, classification, needs_review
    FROM boundary_scores ORDER BY from_timeline_position
  `).all().map((row) => ({ ...row })), [
    {
      from_timeline_position: 0,
      strongest_difference: 0.02,
      classification: "uncertain",
      needs_review: 1,
    },
    {
      from_timeline_position: 1,
      strongest_difference: 0.08,
      classification: "changed",
      needs_review: 0,
    },
  ]);
  assert.deepEqual(database.prepare(`
    SELECT display_cel_number, start_timeline_position, end_timeline_position
    FROM exposures ORDER BY exposure_index
  `).all().map((row) => ({ ...row })), [
    { display_cel_number: 1, start_timeline_position: 0, end_timeline_position: 1 },
    { display_cel_number: 2, start_timeline_position: 2, end_timeline_position: 2 },
  ]);
  database.close();
});

test("persists corrected exposures and restores them instead of the automatic result", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "animation-study-correction-project-test-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const project = new AnalysisProject(join(directory, "fixture.mp4"));
  const scores = fixtureScores();
  const automaticTimeline = buildExposureSpans(classifyBoundaries(scores));
  project.saveCompleted({ scores, timeline: automaticTimeline, sensitivity: 50 });

  const correctedTimeline = applyExposureCorrection(automaticTimeline, {
    type: "select-representative",
    timelinePosition: 1,
  });
  project.saveCorrection(correctedTimeline);

  const loaded = project.loadCompleted({
    sourceFingerprint: scores.sourceFingerprint,
    proxySettings: scores.settings,
    frameCount: scores.frameCount,
  });
  assert.deepEqual(loaded?.timeline, correctedTimeline);

  const database = new DatabaseSync(project.path, { readOnly: true });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM correction_state").get()!.count, 1);
  assert.equal(database.prepare(`
    SELECT representative_timeline_position FROM exposures WHERE exposure_index = 0
  `).get()!.representative_timeline_position, 1);
  database.close();
});

test("rolls back a failed sidecar transaction and keeps the prior completed project", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "animation-study-project-rollback-test-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const project = new AnalysisProject(join(directory, "fixture.mp4"));
  const scores = fixtureScores();
  const timeline = buildExposureSpans(classifyBoundaries(scores));
  project.saveCompleted({ scores, timeline, sensitivity: 50 });

  const database = new DatabaseSync(project.path);
  assert.equal(database.prepare("PRAGMA journal_mode").get()!.journal_mode, "wal");
  assert.equal(database.prepare("PRAGMA synchronous").get()!.synchronous, 2);
  database.exec(`
    CREATE TRIGGER fail_exposure_write BEFORE INSERT ON exposures
    BEGIN
      SELECT RAISE(ABORT, 'simulated interruption');
    END;
  `);
  database.close();

  const corrected = applyExposureCorrection(timeline, {
    type: "select-representative",
    timelinePosition: 1,
  });
  assert.throws(() => project.saveCorrection(corrected), /simulated interruption/);
  const loaded = project.loadCompleted({
    sourceFingerprint: scores.sourceFingerprint,
    proxySettings: scores.settings,
    frameCount: scores.frameCount,
  });
  assert.deepEqual(loaded?.timeline, timeline);
});

test("rejects inconsistent completed rows instead of rerunning analysis", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "animation-study-project-corrupt-test-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const project = new AnalysisProject(join(directory, "fixture.mp4"));
  const scores = fixtureScores();
  const timeline = buildExposureSpans(classifyBoundaries(scores));
  project.saveCompleted({ scores, timeline, sensitivity: 50 });

  const database = new DatabaseSync(project.path);
  database.prepare(`
    UPDATE boundary_scores SET classification = 'same'
    WHERE from_timeline_position = 1
  `).run();
  database.close();

  let analysisRunCount = 0;
  await assert.rejects(
    project.loadCompletedOrAnalyze(
      {
        sourceFingerprint: scores.sourceFingerprint,
        proxySettings: scores.settings,
        frameCount: scores.frameCount,
      },
      async () => {
        analysisRunCount += 1;
        return { scores, timeline, sensitivity: 50 };
      },
    ),
    /Could not load the completed analysis sidecar/,
  );
  assert.equal(analysisRunCount, 0);
});

test("rejects incomplete completed snapshots before replacing saved data", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "animation-study-project-validation-test-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const project = new AnalysisProject(join(directory, "fixture.mp4"));
  const scores = fixtureScores();

  project.savePartial({
    sourceFingerprint: scores.sourceFingerprint,
    proxySettings: scores.settings,
    frameCount: scores.frameCount,
    boundaries: scores.boundaries.slice(0, 1),
  });
  const incompleteScores = { ...scores, boundaries: scores.boundaries.slice(0, 1) };
  assert.throws(
    () => project.saveCompleted({
      scores: incompleteScores,
      timeline: buildExposureSpans(classifyBoundaries(scores)),
      sensitivity: 50,
    }),
    /must contain every source boundary/,
  );

  const database = new DatabaseSync(project.path, { readOnly: true });
  assert.equal(
    database.prepare("SELECT status FROM analysis_state WHERE id = 1").get()!.status,
    "partial",
  );
  database.close();
});

function fixtureScores(): AnalysisScores {
  return {
    schemaVersion: 1,
    sourceFingerprint: "fixture-fingerprint",
    settings: { width: 64, height: 36, edgeLowThreshold: 0.1, edgeHighThreshold: 0.4 },
    frameCount: 3,
    boundaries: [boundary(0, 0.02), boundary(1, 0.08)],
  };
}

function boundary(fromTimelinePosition: number, difference: number): FrameComponentScore {
  return {
    fromTimelinePosition,
    toTimelinePosition: fromTimelinePosition + 1,
    lumaDifference: difference,
    chromaDifference: 0,
    edgeDifference: 0,
  };
}

function fixtureTiming() {
  return normalizeTiming({
    streams: [{
      index: 0,
      codec_name: "h264",
      width: 1920,
      height: 1080,
      pix_fmt: "yuv420p",
      sample_aspect_ratio: "1:1",
      display_aspect_ratio: "16:9",
      avg_frame_rate: "24/1",
      r_frame_rate: "24/1",
      time_base: "1/24",
    }],
    frames: [0, 1, 2].map((timestamp) => ({
      best_effort_timestamp: timestamp,
      duration: 1,
      key_frame: timestamp === 0 ? 1 : 0,
      pict_type: timestamp === 0 ? "I" : "P",
    })),
    format: { format_name: "mov,mp4", duration: "0.125" },
  });
}

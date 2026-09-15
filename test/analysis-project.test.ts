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

test("saves partial and completed analysis snapshots to a SQLite sidecar", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "animation-study-project-test-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const sourcePath = join(directory, "fixture video.mp4");
  const project = new AnalysisProject(sourcePath);
  const scores = fixtureScores();

  project.savePartial({
    sourceFingerprint: scores.sourceFingerprint,
    proxySettings: scores.settings,
    frameCount: scores.frameCount,
    boundaries: scores.boundaries.slice(0, 1),
  });

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
  database.close();

  const timeline = buildExposureSpans(classifyBoundaries(scores));
  project.saveCompleted({ scores, timeline, sensitivity: 50 });

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

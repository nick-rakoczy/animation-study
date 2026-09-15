import assert from "node:assert/strict";
import test from "node:test";
import {
  AnalysisSensitivity,
  classificationSettingsForSensitivity,
  defaultAnalysisSensitivity,
} from "../src/analysis-sensitivity.js";
import { classifyBoundaries } from "../src/boundary-classifier.js";
import { buildExposureSpans } from "../src/exposure-span.js";
import { analyzeSelectedRange } from "../src/range-analysis.js";
import type { AnalysisScores, FrameComponentScore } from "../src/analysis-score.js";

test("classifies adjacent boundaries with an uncertain interval between two thresholds", () => {
  const result = classifyBoundaries(scoresWithBoundaries([
    boundary(0, 0, 0, 0),
    boundary(1, 0.02, 0.005, 0.01),
    boundary(2, 0.01, 0.02, 0.05),
  ]));

  assert.deepEqual(result.classificationSettings, { sameThreshold: 0.01, changedThreshold: 0.04 });
  assert.deepEqual(result.boundaries.map((item) => item.strongestDifference), [0, 0.02, 0.05]);
  assert.deepEqual(result.boundaries.map((item) => item.classification), ["same", "uncertain", "changed"]);
});

test("treats values on the two thresholds as same and changed", () => {
  const result = classifyBoundaries(scoresWithBoundaries([
    boundary(0, 0.01, 0, 0),
    boundary(1, 0, 0.04, 0),
  ]));

  assert.deepEqual(result.boundaries.map((item) => item.classification), ["same", "changed"]);
});

test("accepts threshold overrides and rejects an empty uncertain interval", () => {
  const scores = scoresWithBoundaries([boundary(0, 0.03, 0, 0)]);
  assert.equal(classifyBoundaries(scores, { sameThreshold: 0.03, changedThreshold: 0.06 }).boundaries[0]!.classification, "same");
  assert.throws(
    () => classifyBoundaries(scores, { sameThreshold: 0.04, changedThreshold: 0.04 }),
    /same threshold must be lower/,
  );
});

test("builds chronological spans without merging a returning drawing", () => {
  const classified = classifyBoundaries(scoresWithBoundaries([
    boundary(0, 0, 0, 0),
    boundary(1, 0.1, 0, 0),
    boundary(2, 0, 0, 0),
    boundary(3, 0.1, 0, 0),
    boundary(4, 0, 0, 0),
  ]));
  const timeline = buildExposureSpans(classified);

  assert.deepEqual(timeline.spans.map((span) => [
    span.id,
    span.startTimelinePosition,
    span.endTimelinePosition,
    span.frameCount,
    span.representativeTimelinePosition,
  ]), [
    ["exposure-00000000", 0, 1, 2, 0],
    ["exposure-00000001", 2, 3, 2, 2],
    ["exposure-00000002", 4, 5, 2, 4],
  ]);
  assert.deepEqual(timeline.spans.map((span) => span.displayCelNumber), [1, 2, 3]);
});

test("keeps uncertain boundaries in the provisional span and flags them for review", () => {
  const classified = classifyBoundaries(scoresWithBoundaries([
    boundary(0, 0, 0, 0),
    boundary(1, 0.02, 0, 0),
    boundary(2, 0, 0, 0),
  ]));
  const timeline = buildExposureSpans(classified);

  assert.deepEqual(timeline.spans.map((span) => [span.startTimelinePosition, span.endTimelinePosition]), [[0, 3]]);
  assert.deepEqual(timeline.reviewBoundaries.map((item) => [
    item.fromTimelinePosition,
    item.toTimelinePosition,
  ]), [[1, 2]]);
});

test("builds one exposure for a single-frame source", () => {
  const timeline = buildExposureSpans(classifyBoundaries(scoresWithBoundaries([])));
  assert.deepEqual(timeline.spans, [{
    id: "exposure-00000000",
    exposureIndex: 0,
    displayCelNumber: 1,
    startTimelinePosition: 0,
    endTimelinePosition: 0,
    frameCount: 1,
    representativeTimelinePosition: 0,
  }]);
});

test("maps sensitivity to thresholds and resets to the default", () => {
  assert.deepEqual(classificationSettingsForSensitivity(0), {
    sameThreshold: 0.015,
    changedThreshold: 0.06,
  });
  assert.deepEqual(classificationSettingsForSensitivity(defaultAnalysisSensitivity), {
    sameThreshold: 0.01,
    changedThreshold: 0.04,
  });
  assert.deepEqual(classificationSettingsForSensitivity(100), {
    sameThreshold: 0.005,
    changedThreshold: 0.02,
  });

  const scores = scoresWithBoundaries([boundary(0, 0.03, 0, 0)]);
  const sensitivity = new AnalysisSensitivity();
  assert.equal(sensitivity.analyze(scores).timeline.spans.length, 1);

  sensitivity.set(100);
  const sensitiveResult = sensitivity.analyze(scores);
  assert.equal(sensitiveResult.sensitivity, 100);
  assert.equal(sensitiveResult.timeline.spans.length, 2);

  sensitivity.reset();
  assert.equal(sensitivity.value, defaultAnalysisSensitivity);
  assert.equal(sensitivity.analyze(scores).timeline.spans.length, 1);
});

test("rejects sensitivity values outside the slider range", () => {
  assert.throws(() => new AnalysisSensitivity(-1), /integer from 0 through 100/);
  assert.throws(() => new AnalysisSensitivity(101), /integer from 0 through 100/);
  assert.throws(() => new AnalysisSensitivity(50.5), /integer from 0 through 100/);
});

test("reanalyzes only the selected range and previews its cel count", () => {
  const scores = scoresWithBoundaries([
    boundary(0, 0.08, 0, 0),
    boundary(1, 0.03, 0, 0),
    boundary(2, 0, 0, 0),
    boundary(3, 0.05, 0, 0),
    boundary(4, 0.08, 0, 0),
  ]);

  const defaultPreview = analyzeSelectedRange(scores, {
    startTimelinePosition: 1,
    endTimelinePosition: 4,
  });
  assert.equal(defaultPreview.frameCount, 4);
  assert.deepEqual(
    defaultPreview.boundaries.map((item) => item.fromTimelinePosition),
    [1, 2, 3],
  );
  assert.deepEqual(
    defaultPreview.boundaries.map((item) => item.classification),
    ["uncertain", "same", "changed"],
  );
  assert.deepEqual(
    defaultPreview.reviewBoundaries.map((item) => item.fromTimelinePosition),
    [1],
  );
  assert.equal(defaultPreview.previewCelCount, 2);

  const sensitivePreview = analyzeSelectedRange(
    scores,
    { startTimelinePosition: 1, endTimelinePosition: 4 },
    100,
  );
  assert.deepEqual(
    sensitivePreview.boundaries.map((item) => item.classification),
    ["changed", "same", "changed"],
  );
  assert.equal(sensitivePreview.previewCelCount, 3);
});

test("previews one cel for a one-frame range", () => {
  const preview = analyzeSelectedRange(
    scoresWithBoundaries([boundary(0, 0.08, 0, 0), boundary(1, 0.08, 0, 0)]),
    { startTimelinePosition: 1, endTimelinePosition: 1 },
  );

  assert.deepEqual(preview.boundaries, []);
  assert.deepEqual(preview.reviewBoundaries, []);
  assert.equal(preview.previewCelCount, 1);
});

test("rejects invalid selected ranges", () => {
  const scores = scoresWithBoundaries([boundary(0, 0, 0, 0)]);
  assert.throws(
    () => analyzeSelectedRange(scores, { startTimelinePosition: -1, endTimelinePosition: 0 }),
    /inclusive range within the source/,
  );
  assert.throws(
    () => analyzeSelectedRange(scores, { startTimelinePosition: 1, endTimelinePosition: 0 }),
    /inclusive range within the source/,
  );
  assert.throws(
    () => analyzeSelectedRange(scores, { startTimelinePosition: 0, endTimelinePosition: 2 }),
    /inclusive range within the source/,
  );
  assert.throws(
    () => analyzeSelectedRange(scores, { startTimelinePosition: 0.5, endTimelinePosition: 1 }),
    /positions must be integers/,
  );
});

function boundary(
  fromTimelinePosition: number,
  lumaDifference: number,
  chromaDifference: number,
  edgeDifference: number,
): FrameComponentScore {
  return {
    fromTimelinePosition,
    toTimelinePosition: fromTimelinePosition + 1,
    lumaDifference,
    chromaDifference,
    edgeDifference,
  };
}

function scoresWithBoundaries(boundaries: readonly FrameComponentScore[]): AnalysisScores {
  return {
    schemaVersion: 1,
    sourceFingerprint: "fixture",
    settings: { width: 64, height: 36, edgeLowThreshold: 0.1, edgeHighThreshold: 0.4 },
    frameCount: boundaries.length + 1,
    boundaries,
  };
}

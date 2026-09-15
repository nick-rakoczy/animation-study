import assert from "node:assert/strict";
import test from "node:test";
import { classifyBoundaries } from "../src/boundary-classifier.js";
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

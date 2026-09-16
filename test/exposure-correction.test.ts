import assert from "node:assert/strict";
import test from "node:test";
import type { ExposureTimeline } from "../src/exposure-span.js";
import { applyExposureCorrection, correctionStateForFrame } from "../src/exposure-correction.js";

const timeline: ExposureTimeline = {
  schemaVersion: 1,
  sourceFingerprint: "correction-fixture",
  proxySettings: { width: 64, height: 36, edgeLowThreshold: 0.1, edgeHighThreshold: 0.4 },
  classificationSettings: { sameThreshold: 0.01, changedThreshold: 0.04 },
  frameCount: 6,
  spans: [
    {
      id: "exposure-a",
      exposureIndex: 0,
      displayCelNumber: 1,
      startTimelinePosition: 0,
      endTimelinePosition: 3,
      frameCount: 4,
      representativeTimelinePosition: 0,
    },
    {
      id: "exposure-b",
      exposureIndex: 1,
      displayCelNumber: 2,
      startTimelinePosition: 4,
      endTimelinePosition: 5,
      frameCount: 2,
      representativeTimelinePosition: 4,
    },
  ],
  reviewBoundaries: [{
    fromTimelinePosition: 1,
    toTimelinePosition: 2,
    lumaDifference: 0.02,
    chromaDifference: 0.01,
    edgeDifference: 0.01,
    strongestDifference: 0.02,
    classification: "uncertain",
  }],
};

test("splits and merges exposures while maintaining chronological cel numbers", () => {
  const split = applyExposureCorrection(timeline, { type: "split", timelinePosition: 2 });
  assert.deepEqual(split.spans.map((span) => ({
    cel: span.displayCelNumber,
    start: span.startTimelinePosition,
    end: span.endTimelinePosition,
    frames: span.frameCount,
  })), [
    { cel: 1, start: 0, end: 1, frames: 2 },
    { cel: 2, start: 2, end: 3, frames: 2 },
    { cel: 3, start: 4, end: 5, frames: 2 },
  ]);
  assert.equal(split.reviewBoundaries.length, 0);

  const merged = applyExposureCorrection(split, { type: "merge-previous", timelinePosition: 2 });
  assert.deepEqual(merged.spans.map((span) => [span.startTimelinePosition, span.endTimelinePosition]), [[0, 3], [4, 5]]);
  assert.deepEqual(merged.spans.map((span) => span.displayCelNumber), [1, 2]);
});

test("selects a representative only within its containing exposure", () => {
  const corrected = applyExposureCorrection(timeline, { type: "select-representative", timelinePosition: 3 });
  assert.equal(corrected.spans[0]?.representativeTimelinePosition, 3);
  assert.equal(corrected.spans[1]?.representativeTimelinePosition, 4);
  assert.deepEqual(correctionStateForFrame(corrected, 3), {
    canSplit: true,
    canMergePrevious: false,
    canMergeNext: true,
    representativeFrameNumber: 4,
    selectedFrameIsRepresentative: true,
    boundaryBeforeNeedsReview: false,
  });
});

test("confirms uncertain boundaries as held or changed", () => {
  const provisionalTimeline: ExposureTimeline = {
    ...timeline,
    spans: [
      {
        ...timeline.spans[0]!,
        endTimelinePosition: 1,
        frameCount: 2,
      },
      {
        ...timeline.spans[0]!,
        id: "exposure-uncertain",
        exposureIndex: 1,
        displayCelNumber: 2,
        startTimelinePosition: 2,
        representativeTimelinePosition: 2,
        frameCount: 2,
      },
      {
        ...timeline.spans[1]!,
        exposureIndex: 2,
        displayCelNumber: 3,
      },
    ],
  };

  const held = applyExposureCorrection(provisionalTimeline, { type: "confirm-same", timelinePosition: 2 });
  assert.equal(held.spans.length, 2);
  assert.deepEqual(held.spans.map((span) => [span.startTimelinePosition, span.endTimelinePosition]), [[0, 3], [4, 5]]);
  assert.equal(held.reviewBoundaries.length, 0);

  const changed = applyExposureCorrection(provisionalTimeline, { type: "confirm-changed", timelinePosition: 2 });
  assert.deepEqual(changed.spans.map((span) => span.startTimelinePosition), [0, 2, 4]);
  assert.equal(changed.reviewBoundaries.length, 0);
  assert.throws(
    () => applyExposureCorrection(held, { type: "confirm-changed", timelinePosition: 2 }),
    /no uncertain boundary/,
  );
});

test("supports uncertain boundaries saved inside spans by older projects", () => {
  const held = applyExposureCorrection(timeline, { type: "confirm-same", timelinePosition: 2 });
  assert.deepEqual(held.spans.map((span) => [span.startTimelinePosition, span.endTimelinePosition]), [[0, 3], [4, 5]]);

  const changed = applyExposureCorrection(timeline, { type: "confirm-changed", timelinePosition: 2 });
  assert.deepEqual(changed.spans.map((span) => [span.startTimelinePosition, span.endTimelinePosition]), [[0, 1], [2, 3], [4, 5]]);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultTimelineScaleIndex,
  nextTimelineScaleIndex,
  timelineSampleCounts,
} from "../src/timeline-scale.js";

test("moves through bounded timeline sample-density levels", () => {
  assert.equal(timelineSampleCounts[defaultTimelineScaleIndex], 12);
  assert.equal(nextTimelineScaleIndex(1, -1, 1000), 0);
  assert.equal(nextTimelineScaleIndex(1, 1, 1000), 2);
  assert.equal(nextTimelineScaleIndex(0, -1, 1000), 0);
  assert.equal(nextTimelineScaleIndex(4, 1, 1000), 4);
});

test("skips scale levels that cannot change a short filmstrip", () => {
  assert.equal(nextTimelineScaleIndex(3, -1, 20), 1);
  assert.equal(nextTimelineScaleIndex(1, 1, 20), 2);
  assert.equal(nextTimelineScaleIndex(1, -1, 4), 1);
  assert.equal(nextTimelineScaleIndex(1, 1, 4), 1);
});

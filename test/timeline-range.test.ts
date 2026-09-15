import assert from "node:assert/strict";
import test from "node:test";
import { createInclusiveTimelineRange, timelineRangeFractions } from "../src/timeline-range.js";

test("normalizes forward and reverse inclusive timeline selections", () => {
  const forward = createInclusiveTimelineRange(2, 6, 10);
  const reverse = createInclusiveTimelineRange(6, 2, 10);
  assert.deepEqual(forward, { startPosition: 2, endPosition: 6, frameCount: 5 });
  assert.deepEqual(reverse, forward);
});

test("gives one-frame selections visible frame-cell width", () => {
  const range = createInclusiveTimelineRange(4, 4, 10);
  assert.deepEqual(range, { startPosition: 4, endPosition: 4, frameCount: 1 });
  assert.deepEqual(timelineRangeFractions(range, 10), { left: 0.4, width: 0.1 });
});

test("rejects positions outside the source", () => {
  assert.throws(() => createInclusiveTimelineRange(-1, 2, 10), /outside/);
  assert.throws(() => createInclusiveTimelineRange(2, 10, 10), /outside/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { scrollAdjustmentToReveal } from "../src/timeline-scroll.js";

test("leaves a playhead alone when it is inside the visible timeline", () => {
  assert.equal(scrollAdjustmentToReveal(100, 500, 250, 252, 48), 0);
});

test("scrolls in either direction to keep a margin around the playhead", () => {
  assert.equal(scrollAdjustmentToReveal(100, 500, 120, 122, 48), -28);
  assert.equal(scrollAdjustmentToReveal(100, 500, 480, 482, 48), 30);
});

test("limits the margin for narrow timeline viewports", () => {
  assert.equal(scrollAdjustmentToReveal(100, 140, 100, 102, 48), -20);
});

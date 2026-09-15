import assert from "node:assert/strict";
import test from "node:test";
import { timelinePositionFromOffset } from "../src/timeline-scrub.js";

test("maps the full filmstrip width to exact integer timeline positions", () => {
  assert.equal(timelinePositionFromOffset(0, 1000, 101), 0);
  assert.equal(timelinePositionFromOffset(374, 1000, 101), 37);
  assert.equal(timelinePositionFromOffset(375, 1000, 101), 38);
  assert.equal(timelinePositionFromOffset(1000, 1000, 101), 100);
});

test("clamps pointer positions outside the filmstrip", () => {
  assert.equal(timelinePositionFromOffset(-20, 100, 24), 0);
  assert.equal(timelinePositionFromOffset(120, 100, 24), 23);
  assert.equal(timelinePositionFromOffset(50, 100, 1), 0);
});

test("rejects invalid filmstrip dimensions and frame counts", () => {
  assert.throws(() => timelinePositionFromOffset(0, 0, 24), /width/);
  assert.throws(() => timelinePositionFromOffset(0, 100, 0), /Frame count/);
});

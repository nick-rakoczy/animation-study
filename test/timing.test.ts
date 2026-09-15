import assert from "node:assert/strict";
import test from "node:test";
import { chooseSamplePositions } from "../src/contact-sheet.js";
import { rationalToDecimal } from "../src/rational.js";
import { createPlaybackFrames, playbackSeekTime, timelinePositionAtPlaybackTime } from "../src/playback.js";
import { normalizeTiming, type RawProbe } from "../src/timing.js";

test("maps constant-rate frames to zero-based positions and exact rational timing", () => {
  const result = normalizeTiming(probeWithFrames([
    { best_effort_timestamp: 0, pkt_duration: 1001, key_frame: 1, pict_type: "I" },
    { best_effort_timestamp: 1001, pkt_duration: 1001, key_frame: 0, pict_type: "P" },
    { best_effort_timestamp: 2002, pkt_duration: 1001, key_frame: 0, pict_type: "P" },
  ], "1/24000", "24000/1001"));

  assert.equal(result.frameCount, 3);
  assert.deepEqual(result.frames.map((frame) => frame.timelinePosition), [0, 1, 2]);
  assert.deepEqual(result.frames[1]!.presentationTimestamp, { numerator: "1001", denominator: "24000" });
  assert.deepEqual(result.frames[1]!.presentationDuration, { numerator: "1001", denominator: "24000" });
  assert.deepEqual(result.presentationSpan, { numerator: "1001", denominator: "8000" });
});

test("sorts decoded frames into presentation order while retaining decode indices", () => {
  const result = normalizeTiming(probeWithFrames([
    { best_effort_timestamp: 2, pkt_duration: 1 },
    { best_effort_timestamp: 0, pkt_duration: 1 },
    { best_effort_timestamp: 1, pkt_duration: 1 },
  ], "1/24", "24/1"));

  assert.deepEqual(result.frames.map((frame) => frame.decodedFrameIndex), [1, 2, 0]);
  assert.deepEqual(result.frames.map((frame) => frame.presentationTimestampTicks), ["0", "1", "2"]);
});

test("preserves variable durations and infers missing packet durations from timestamps", () => {
  const result = normalizeTiming(probeWithFrames([
    { best_effort_timestamp: 0, pkt_duration: 40 },
    { best_effort_timestamp: 40 },
    { best_effort_timestamp: 100, pkt_duration: 20 },
  ], "1/1000", "0/0"));

  assert.deepEqual(result.frames.map((frame) => frame.presentationDuration), [
    { numerator: "1", denominator: "25" },
    { numerator: "3", denominator: "50" },
    { numerator: "1", denominator: "50" },
  ]);
  assert.equal(result.frames[1]!.durationSource, "next-timestamp");
});

test("accepts the frame duration field emitted by FFmpeg 9", () => {
  const result = normalizeTiming(probeWithFrames([
    { best_effort_timestamp: 0, duration: 40 },
    { best_effort_timestamp: 40, duration: 60 },
  ], "1/1000", "0/0"));

  assert.deepEqual(result.frames.map((frame) => frame.presentationDuration), [
    { numerator: "1", denominator: "25" },
    { numerator: "3", denominator: "50" },
  ]);
  assert.deepEqual(result.frames.map((frame) => frame.presentationDurationTicks), ["40", "60"]);
});

test("samples both ends without duplicate frame positions", () => {
  assert.deepEqual(chooseSamplePositions(101, 5), [0, 25, 50, 75, 100]);
  assert.deepEqual(chooseSamplePositions(3, 25), [0, 1, 2]);
});

test("formats rational seek positions without floating-point conversion", () => {
  assert.equal(rationalToDecimal({ numerator: "1001", denominator: "24000" }, 12), "0.041708333333");
  assert.equal(rationalToDecimal({ numerator: "-1", denominator: "2" }, 3), "-0.500");
});

test("maps constant-rate playback progress to indexed frame positions", () => {
  const timing = normalizeTiming(probeWithFrames([
    { best_effort_timestamp: 100, pkt_duration: 40 },
    { best_effort_timestamp: 140, pkt_duration: 40 },
    { best_effort_timestamp: 180, pkt_duration: 40 },
  ], "1/1000", "25/1"));
  const frames = createPlaybackFrames(timing);

  assert.deepEqual(frames.map((frame) => frame.playbackTimestamp), [
    { numerator: "0", denominator: "1" },
    { numerator: "1", denominator: "25" },
    { numerator: "2", denominator: "25" },
  ]);
  assert.equal(timelinePositionAtPlaybackTime(frames, 0), 0);
  assert.equal(timelinePositionAtPlaybackTime(frames, 0.039), 0);
  assert.equal(timelinePositionAtPlaybackTime(frames, 0.04), 1);
  assert.equal(timelinePositionAtPlaybackTime(frames, 2), 2);
});

test("maps variable-rate playback progress using each frame timestamp", () => {
  const timing = normalizeTiming(probeWithFrames([
    { best_effort_timestamp: 0, pkt_duration: 20 },
    { best_effort_timestamp: 20, pkt_duration: 80 },
    { best_effort_timestamp: 100, pkt_duration: 30 },
  ], "1/1000", "0/0"));
  const frames = createPlaybackFrames(timing);

  assert.equal(timelinePositionAtPlaybackTime(frames, 0.019), 0);
  assert.equal(timelinePositionAtPlaybackTime(frames, 0.02), 1);
  assert.equal(timelinePositionAtPlaybackTime(frames, 0.099), 1);
  assert.equal(timelinePositionAtPlaybackTime(frames, 0.1), 2);
});

test("seeks inside an indexed playback frame instead of on its timestamp boundary", () => {
  const timing = normalizeTiming(probeWithFrames([
    { best_effort_timestamp: 0, pkt_duration: 20 },
    { best_effort_timestamp: 20, pkt_duration: 80 },
  ], "1/1000", "0/0"));
  const frames = createPlaybackFrames(timing);

  assert.equal(playbackSeekTime(frames[0]!), 0.01);
  assert.equal(playbackSeekTime(frames[1]!), 0.06);
  for (const frame of frames) {
    assert.equal(timelinePositionAtPlaybackTime(frames, playbackSeekTime(frame)), frame.timelinePosition);
  }
});

function probeWithFrames(
  frames: NonNullable<RawProbe["frames"]>,
  timeBase: string,
  averageFrameRate: string,
): RawProbe {
  return {
    streams: [{
      index: 0,
      codec_name: "h264",
      width: 1920,
      height: 1080,
      time_base: timeBase,
      avg_frame_rate: averageFrameRate,
      r_frame_rate: averageFrameRate,
    }],
    frames,
    format: { format_name: "matroska", duration: "1.000000" },
  };
}

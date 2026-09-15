import assert from "node:assert/strict";
import { mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sourceContentFingerprint } from "../src/source-fingerprint.js";
import { FrameProxyCache } from "../src/frame-cache.js";
import { PlaybackProxy } from "../src/playback-proxy.js";
import { normalizeTiming } from "../src/timing.js";

test("fingerprints file content instead of its path, size, or modification time", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "animation-study-fingerprint-test-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const sourcePath = join(directory, "source.mp4");
  await writeFile(sourcePath, "AAAA");
  const originalTime = (await stat(sourcePath)).mtime;
  const first = await sourceContentFingerprint(sourcePath);

  await writeFile(sourcePath, "BBBB");
  await utimes(sourcePath, originalTime, originalTime);
  const second = await sourceContentFingerprint(sourcePath);

  assert.match(first, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});

test("uses the content fingerprint in display and playback cache directories", () => {
  const timing = normalizeTiming({
    streams: [{ width: 16, height: 16, time_base: "1/1", avg_frame_rate: "1/1" }],
    frames: [{ best_effort_timestamp: 0, duration: 1 }],
  });
  const firstFingerprint = `sha256:${"a".repeat(64)}`;
  const secondFingerprint = `sha256:${"b".repeat(64)}`;
  const frameA = new FrameProxyCache({
    sourcePath: "/tmp/source.mp4",
    sourceFingerprint: firstFingerprint,
    timing,
    cacheRoot: "/tmp/animation-study-cache-key-test",
  });
  const frameB = new FrameProxyCache({
    sourcePath: "/tmp/source.mp4",
    sourceFingerprint: secondFingerprint,
    timing,
    cacheRoot: "/tmp/animation-study-cache-key-test",
  });
  const playbackA = new PlaybackProxy({
    sourcePath: "/tmp/source.mp4",
    sourceFingerprint: firstFingerprint,
    timing,
    cacheRoot: "/tmp/animation-study-cache-key-test",
  });
  const playbackB = new PlaybackProxy({
    sourcePath: "/tmp/source.mp4",
    sourceFingerprint: secondFingerprint,
    timing,
    cacheRoot: "/tmp/animation-study-cache-key-test",
  });
  assert.notEqual(frameA.directory, frameB.directory);
  assert.notEqual(playbackA.directory, playbackB.directory);
});

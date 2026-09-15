import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createContactSheet } from "../src/contact-sheet.js";
import { FrameProxyCache } from "../src/frame-cache.js";
import { PlaybackProxy } from "../src/playback-proxy.js";
import { probeVideo } from "../src/probe.js";

const execFileAsync = promisify(execFile);

test("probes a real 24000/1001 video and creates a contact sheet", async (context) => {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
  } catch {
    context.skip("ffmpeg and ffprobe are required for this integration test");
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "animation-study-test-"));
  const videoPath = join(directory, "timing fixture.mp4");
  const contactSheetPath = join(directory, "contact sheet.png");
  await execFileAsync("ffmpeg", [
    "-v", "error",
    "-f", "lavfi",
    "-i", "testsrc2=size=160x90:rate=24000/1001:duration=0.25",
    "-f", "lavfi",
    "-i", "sine=frequency=440:sample_rate=48000:duration=0.25",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-y",
    videoPath,
  ]);

  const timing = await probeVideo(videoPath);
  assert.equal(timing.frameCount, 6);
  assert.deepEqual(timing.stream.averageFrameRate, { numerator: "24000", denominator: "1001" });
  assert.deepEqual(timing.frames.map((frame) => frame.timelinePosition), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(timing.frames[5]!.presentationDuration, { numerator: "1001", denominator: "24000" });

  const sheet = await createContactSheet({
    inputPath: videoPath,
    outputPath: contactSheetPath,
    frameCount: timing.frameCount,
    sampleCount: 4,
  });
  assert.deepEqual(sheet.sampledTimelinePositions, [0, 2, 3, 5]);
  assert.ok((await stat(contactSheetPath)).size > 0);

  const frameCache = new FrameProxyCache({
    sourcePath: videoPath,
    timing,
    cacheRoot: directory,
    widthLimit: 160,
    prefetchRadius: 1,
    maxEntries: 3,
  });
  const cachedFrame = await frameCache.getFrame(3);
  const referenceFramePath = join(directory, "reference.png");
  await execFileAsync("ffmpeg", [
    "-v", "error",
    "-i", videoPath,
    "-vf", "select='eq(n\\,3)',scale=w='min(iw,160)':h='min(ih,160)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    "-frames:v", "1",
    "-fps_mode", "passthrough",
    "-y",
    referenceFramePath,
  ]);
  assert.deepEqual(await readFile(cachedFrame.path), await readFile(referenceFramePath));

  await frameCache.getFrame(0);
  assert.ok(frameCache.cachedPositions().length <= 3);
  await frameCache.clear();

  const playback = new PlaybackProxy({
    sourcePath: videoPath,
    timing,
    cacheRoot: directory,
    widthLimit: 160,
  });
  const playbackPath = await playback.create();
  assert.ok((await stat(playbackPath)).size > 0);
  const playbackProbe = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_name,codec_type",
    "-of", "json",
    playbackPath,
  ]);
  const playbackStreams = JSON.parse(playbackProbe.stdout) as {
    readonly streams: readonly { readonly codec_name: string; readonly codec_type: string }[];
  };
  assert.deepEqual(playbackStreams.streams, [
    { codec_name: "vp9", codec_type: "video" },
    { codec_name: "opus", codec_type: "audio" },
  ]);
  await playback.clear();
});

test("keeps a timed audio event aligned with its video frame in the playback proxy", async (context) => {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
  } catch {
    context.skip("ffmpeg and ffprobe are required for this integration test");
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "animation-study-sync-test-"));
  const sourcePath = join(directory, "synchronization fixture.mp4");
  await execFileAsync("ffmpeg", [
    "-v", "error",
    "-f", "lavfi",
    "-i", "color=c=black:s=64x64:r=10:d=2",
    "-f", "lavfi",
    "-i", "anullsrc=r=48000:cl=mono:d=1",
    "-f", "lavfi",
    "-i", "sine=f=1000:r=48000:d=0.1",
    "-f", "lavfi",
    "-i", "anullsrc=r=48000:cl=mono:d=0.9",
    "-filter_complex",
    "[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,1,1.099)'[v];[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]",
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-y",
    sourcePath,
  ]);

  const timing = await probeVideo(sourcePath);
  const playback = new PlaybackProxy({
    sourcePath,
    timing,
    cacheRoot: directory,
    widthLimit: 64,
  });
  const playbackPath = await playback.create();
  const sourceEvents = await detectSyncEvents(sourcePath, directory, "source");
  const proxyEvents = await detectSyncEvents(playbackPath, directory, "proxy");
  const sourceSkew = sourceEvents.audioSeconds - sourceEvents.videoSeconds;
  const proxySkew = proxyEvents.audioSeconds - proxyEvents.videoSeconds;

  assert.ok(Math.abs(sourceEvents.videoSeconds - 1) <= 0.001, `source flash was at ${sourceEvents.videoSeconds}s`);
  assert.ok(Math.abs(sourceEvents.audioSeconds - 1) <= 0.03, `source tone was at ${sourceEvents.audioSeconds}s`);
  assert.ok(
    Math.abs(proxySkew - sourceSkew) <= 0.03,
    `playback proxy changed audio/video skew from ${sourceSkew}s to ${proxySkew}s`,
  );
  await playback.clear();
});

interface SyncEvents {
  readonly videoSeconds: number;
  readonly audioSeconds: number;
}

async function detectSyncEvents(mediaPath: string, directory: string, name: string): Promise<SyncEvents> {
  const videoPath = join(directory, `${name}.gray`);
  const audioPath = join(directory, `${name}.f32le`);
  const [frameProbe] = await Promise.all([
    execFileAsync("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "frame=best_effort_timestamp_time",
      "-of", "json",
      mediaPath,
    ]),
    execFileAsync("ffmpeg", [
      "-v", "error",
      "-i", mediaPath,
      "-map", "0:v:0",
      "-an",
      "-pix_fmt", "gray",
      "-fps_mode", "passthrough",
      "-f", "rawvideo",
      "-y",
      videoPath,
    ]),
    execFileAsync("ffmpeg", [
      "-v", "error",
      "-i", mediaPath,
      "-map", "0:a:0",
      "-vn",
      "-ac", "1",
      "-ar", "48000",
      "-f", "f32le",
      "-y",
      audioPath,
    ]),
  ]);

  const parsedFrames = JSON.parse(frameProbe.stdout) as {
    readonly frames: readonly { readonly best_effort_timestamp_time: string }[];
  };
  const pixels = await readFile(videoPath);
  const bytesPerFrame = 64 * 64;
  assert.equal(pixels.length, parsedFrames.frames.length * bytesPerFrame);
  const brightFrame = parsedFrames.frames.findIndex((_frame, index) => {
    let total = 0;
    const start = index * bytesPerFrame;
    for (let offset = start; offset < start + bytesPerFrame; offset += 1) total += pixels[offset]!;
    return total / bytesPerFrame > 128;
  });
  assert.notEqual(brightFrame, -1, `${name} has no white synchronization frame`);

  const samples = await readFile(audioPath);
  const samplesPerWindow = 480;
  let toneSample = -1;
  for (let start = 0; start + samplesPerWindow * 4 <= samples.length; start += samplesPerWindow * 4) {
    let squareTotal = 0;
    for (let offset = start; offset < start + samplesPerWindow * 4; offset += 4) {
      const sample = samples.readFloatLE(offset);
      squareTotal += sample * sample;
    }
    if (Math.sqrt(squareTotal / samplesPerWindow) > 0.05) {
      toneSample = start / 4;
      break;
    }
  }
  assert.notEqual(toneSample, -1, `${name} has no audible synchronization tone`);

  return {
    videoSeconds: Number(parsedFrames.frames[brightFrame]!.best_effort_timestamp_time),
    audioSeconds: toneSample / 48000,
  };
}

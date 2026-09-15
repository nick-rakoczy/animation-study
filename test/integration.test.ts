import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { AnalysisProxyCache } from "../src/analysis-proxy.js";
import { AnalysisScoreCache } from "../src/analysis-score.js";
import { AnalysisCancelledError, type AnalysisJobProgress } from "../src/analysis-job.js";
import { classifyBoundaries } from "../src/boundary-classifier.js";
import { createContactSheet } from "../src/contact-sheet.js";
import { buildExposureSpans } from "../src/exposure-span.js";
import { FrameProxyCache } from "../src/frame-cache.js";
import { PlaybackProxy } from "../src/playback-proxy.js";
import { probeVideo } from "../src/probe.js";
import { ApplicationService } from "../src/main/application-service.js";

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

test("opens a one-hour 1080p source without creating a full-resolution frame sequence", async (context) => {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
  } catch {
    context.skip("ffmpeg and ffprobe are required for this integration test");
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "animation-study-long-source-test-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const sourcePath = join(directory, "one hour 1080p.mp4");
  const cacheRoot = join(directory, "cache");
  await execFileAsync("ffmpeg", [
    "-v", "error",
    "-f", "lavfi",
    "-i", "color=c=black:s=1920x1080:r=1/60:d=3600",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-pix_fmt", "yuv420p",
    "-y",
    sourcePath,
  ]);

  const timing = await probeVideo(sourcePath);
  assert.equal(timing.stream.width, 1920);
  assert.equal(timing.stream.height, 1080);
  assert.equal(timing.frameCount, 60);

  const frameCache = new FrameProxyCache({
    sourcePath,
    timing,
    cacheRoot,
    widthLimit: 1280,
    prefetchRadius: 2,
    maxEntries: 5,
  });
  const firstFrame = await frameCache.getFrame(0);
  const frameProbe = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "json",
    firstFrame.path,
  ]);
  const frameMetadata = JSON.parse(frameProbe.stdout) as {
    readonly streams: readonly { readonly width: number; readonly height: number }[];
  };
  assert.deepEqual(frameMetadata.streams, [{ width: 1280, height: 720 }]);

  const playback = new PlaybackProxy({
    sourcePath,
    timing,
    cacheRoot,
    widthLimit: 1280,
  });
  const playbackPath = await playback.create();
  const playbackProbe = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration",
    "-of", "json",
    playbackPath,
  ]);
  const playbackMetadata = JSON.parse(playbackProbe.stdout) as {
    readonly streams: readonly { readonly width: number; readonly height: number }[];
    readonly format: { readonly duration: string };
  };
  assert.deepEqual(playbackMetadata.streams, [{ width: 1280, height: 720 }]);
  assert.equal(Number(playbackMetadata.format.duration), 3600);

  const cacheEntries = await readdir(cacheRoot, { recursive: true });
  const pngEntries = cacheEntries.filter((entry) => entry.endsWith(".png"));
  const webmEntries = cacheEntries.filter((entry) => entry.endsWith(".webm"));
  assert.ok(pngEntries.length <= 3, `expected at most 3 cached PNG frames, found ${pngEntries.length}`);
  assert.equal(webmEntries.length, 1);

  await Promise.all([frameCache.clear(), playback.clear()]);
});

test("creates cached luma, chroma, and edge analysis proxies", async (context) => {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
  } catch {
    context.skip("ffmpeg and ffprobe are required for this integration test");
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "animation-study-analysis-proxy-test-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const sourcePath = join(directory, "analysis colors and edges.mp4");
  await execFileAsync("ffmpeg", [
    "-v", "error",
    "-f", "lavfi",
    "-i", "color=c=black:s=160x90:r=1:d=3",
    "-vf", "drawbox=x=0:y=0:w=160:h=90:color=red:t=fill:enable='between(t,1,1.999)',drawbox=x=80:y=0:w=80:h=90:color=white:t=fill:enable='between(t,2,2.999)'",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-y",
    sourcePath,
  ]);

  const timing = await probeVideo(sourcePath);
  assert.equal(timing.frameCount, 3);
  const cache = new AnalysisProxyCache({ sourcePath, timing, cacheRoot: join(directory, "cache") });
  const proxyProgress: AnalysisJobProgress[] = [];
  const proxy = await cache.create(undefined, (progress) => proxyProgress.push(progress));
  assert.equal(proxyProgress[0]?.stage, "analysis-proxy");
  assert.equal(proxyProgress[0]?.completedFrames, 0);
  assert.equal(proxyProgress.at(-1)?.completedFrames, timing.frameCount);
  assert.equal(proxyProgress.at(-1)?.fraction, 1);
  const firstModifiedTime = (await stat(proxy.path)).mtimeMs;
  const reusedProgress: AnalysisJobProgress[] = [];
  const reusedProxy = await cache.create(undefined, (progress) => reusedProgress.push(progress));
  assert.equal(reusedProxy.path, proxy.path);
  assert.equal((await stat(reusedProxy.path)).mtimeMs, firstModifiedTime);
  assert.deepEqual(reusedProgress, [{
    stage: "analysis-proxy",
    completedFrames: 3,
    totalFrames: 3,
    fraction: 1,
    cached: true,
  }]);
  assert.equal(proxy.frameCount, 3);
  assert.deepEqual(proxy.settings, {
    width: 64,
    height: 36,
    edgeLowThreshold: 0.1,
    edgeHighThreshold: 0.4,
  });

  const streamProbe = await execFileAsync("ffprobe", [
    "-v", "error",
    "-count_frames",
    "-select_streams", "v",
    "-show_entries", "stream=index,codec_name,pix_fmt,width,height,nb_read_frames",
    "-of", "json",
    proxy.path,
  ]);
  const streamMetadata = JSON.parse(streamProbe.stdout) as {
    readonly streams: readonly {
      readonly index: number;
      readonly codec_name: string;
      readonly pix_fmt: string;
      readonly width: number;
      readonly height: number;
      readonly nb_read_frames: string;
    }[];
  };
  assert.deepEqual(streamMetadata.streams, [
    { index: 0, codec_name: "ffv1", width: 64, height: 36, pix_fmt: "yuv444p", nb_read_frames: "3" },
    { index: 1, codec_name: "ffv1", width: 64, height: 36, pix_fmt: "gray", nb_read_frames: "3" },
  ]);

  const colorPlanesPath = join(directory, "color-planes.yuv");
  const edgePlanesPath = join(directory, "edge-planes.gray");
  await Promise.all([
    execFileAsync("ffmpeg", [
      "-v", "error",
      "-i", proxy.path,
      "-map", "0:v:0",
      "-pix_fmt", "yuv444p",
      "-fps_mode", "passthrough",
      "-f", "rawvideo",
      "-y",
      colorPlanesPath,
    ]),
    execFileAsync("ffmpeg", [
      "-v", "error",
      "-i", proxy.path,
      "-map", "0:v:1",
      "-pix_fmt", "gray",
      "-fps_mode", "passthrough",
      "-f", "rawvideo",
      "-y",
      edgePlanesPath,
    ]),
  ]);

  const colorPlanes = await readFile(colorPlanesPath);
  const edgePlanes = await readFile(edgePlanesPath);
  const pixelsPerFrame = 64 * 36;
  const colorBytesPerFrame = pixelsPerFrame * 3;
  assert.equal(colorPlanes.length, colorBytesPerFrame * 3);
  assert.equal(edgePlanes.length, pixelsPerFrame * 3);

  const blackLuma = colorPlanes.subarray(0, pixelsPerFrame);
  const redLuma = colorPlanes.subarray(colorBytesPerFrame, colorBytesPerFrame + pixelsPerFrame);
  const blackChroma = colorPlanes.subarray(pixelsPerFrame, colorBytesPerFrame);
  const redChroma = colorPlanes.subarray(colorBytesPerFrame + pixelsPerFrame, colorBytesPerFrame * 2);
  assert.ok(byteDifference(blackLuma, redLuma) > 0);
  assert.ok(byteDifference(blackChroma, redChroma) > 0);

  const blackEdges = edgePlanes.subarray(0, pixelsPerFrame);
  const dividedEdges = edgePlanes.subarray(pixelsPerFrame * 2, pixelsPerFrame * 3);
  assert.ok(byteTotal(dividedEdges) > byteTotal(blackEdges));

  const scoreCache = new AnalysisScoreCache(proxy);
  const scoreProgress: AnalysisJobProgress[] = [];
  const scores = await scoreCache.create(undefined, (progress) => scoreProgress.push(progress));
  assert.deepEqual(
    scoreProgress.filter((progress) => progress.completedFrames === 0).map((progress) => progress.stage),
    ["luma-chroma-scores", "edge-scores"],
  );
  assert.deepEqual(
    scoreProgress.filter((progress) => progress.fraction === 1).map((progress) => progress.stage),
    ["luma-chroma-scores", "edge-scores"],
  );
  assert.deepEqual(scores.boundaries.map((boundary) => [
    boundary.fromTimelinePosition,
    boundary.toTimelinePosition,
  ]), [[0, 1], [1, 2]]);
  for (const boundary of scores.boundaries) {
    assert.ok(boundary.lumaDifference >= 0 && boundary.lumaDifference <= 1);
    assert.ok(boundary.chromaDifference >= 0 && boundary.chromaDifference <= 1);
    assert.ok(boundary.edgeDifference >= 0 && boundary.edgeDifference <= 1);
  }
  assert.ok(scores.boundaries[0]!.lumaDifference > 0);
  assert.ok(scores.boundaries[0]!.chromaDifference > 0);
  assert.ok(scores.boundaries[1]!.edgeDifference > scores.boundaries[0]!.edgeDifference);
  const scorePath = join(dirname(proxy.path), "component-scores-v1.json");
  const scoreModifiedTime = (await stat(scorePath)).mtimeMs;
  assert.deepEqual(JSON.parse(await readFile(scorePath, "utf8")), scores);
  assert.deepEqual(await scoreCache.create(), scores);
  assert.equal((await stat(scorePath)).mtimeMs, scoreModifiedTime);
  const classified = classifyBoundaries(scores);
  assert.deepEqual(classified.boundaries.map((boundary) => boundary.classification), ["changed", "changed"]);
  assert.deepEqual(
    buildExposureSpans(classified).spans.map((span) => [span.startTimelinePosition, span.endTimelinePosition]),
    [[0, 0], [1, 1], [2, 2]],
  );

  const alternateCache = new AnalysisProxyCache({
    sourcePath,
    timing,
    cacheRoot: join(directory, "cache"),
    settings: { width: 32, height: 18 },
  });
  const alternateProxy = await alternateCache.create();
  assert.equal(alternateProxy.sourceFingerprint, proxy.sourceFingerprint);
  assert.notEqual(alternateProxy.path, proxy.path);
  const abortController = new AbortController();
  const cancelledScoreCache = new AnalysisScoreCache(alternateProxy);
  await assert.rejects(
    cancelledScoreCache.create(abortController.signal, (progress) => {
      if (progress.stage === "luma-chroma-scores" && progress.completedFrames === 1) {
        abortController.abort();
      }
    }),
    (error) => error instanceof AnalysisCancelledError,
  );
  assert.deepEqual(
    (await readdir(dirname(alternateProxy.path))).filter((entry) => entry.startsWith("component-scores")),
    [],
  );
  await Promise.all([cache.clear(), alternateCache.clear()]);
});

test("opens the viewer with pending cel data and fills it after background analysis", async (context) => {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
  } catch {
    context.skip("ffmpeg and ffprobe are required for this integration test");
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "animation-study-cel-information-test-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const sourcePath = join(directory, "held drawing.mp4");
  await execFileAsync("ffmpeg", [
    "-v", "error",
    "-f", "lavfi",
    "-i", "color=c=black:s=160x90:r=4:d=1",
    "-vf", "drawbox=x=30:y=15:w=100:h=60:color=white:t=fill:enable='gte(n,2)'",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-y",
    sourcePath,
  ]);

  const service = new ApplicationService(join(directory, "cache"));
  const opened = await service.openVideo(sourcePath);
  assert.equal(opened.frame.displayFrameNumber, 1);
  assert.deepEqual(await service.getCelInformation(0), { status: "pending" });

  const thumbnails = await service.getTimelineThumbnails(3);
  assert.deepEqual(thumbnails.map(({ timelinePosition, displayFrameNumber }) => ({ timelinePosition, displayFrameNumber })), [
    { timelinePosition: 0, displayFrameNumber: 1 },
    { timelinePosition: 2, displayFrameNumber: 3 },
    { timelinePosition: 3, displayFrameNumber: 4 },
  ]);
  assert.ok(thumbnails.every((thumbnail) => thumbnail.imageDataUrl.startsWith("data:image/png;base64,")));

  const firstCel = await waitForCelInformation(service, 1);
  assert.deepEqual(firstCel, {
    status: "ready",
    displayCelNumber: 1,
    exposureStartFrameNumber: 1,
    holdLengthFrames: 2,
    cadenceLabel: "On twos",
    elapsedDuration: { numerator: "1", denominator: "2" },
  });
  const secondCel = await service.getCelInformation(2);
  assert.deepEqual(secondCel, {
    status: "ready",
    displayCelNumber: 2,
    exposureStartFrameNumber: 3,
    holdLengthFrames: 2,
    cadenceLabel: "On twos",
    elapsedDuration: { numerator: "1", denominator: "2" },
  });
  assert.deepEqual(await service.getAdjacentCelPosition(1, "next"), {
    status: "ready",
    timelinePosition: 2,
  });
  assert.deepEqual(await service.getAdjacentCelPosition(3, "previous"), {
    status: "ready",
    timelinePosition: 0,
  });
  assert.deepEqual(await service.getAdjacentCelPosition(0, "previous"), {
    status: "ready",
    timelinePosition: null,
  });
  assert.ok((await stat(`${sourcePath}.animstudy`)).size > 0);
});

interface SyncEvents {
  readonly videoSeconds: number;
  readonly audioSeconds: number;
}

async function waitForCelInformation(
  service: ApplicationService,
  timelinePosition: number,
) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const information = await service.getCelInformation(timelinePosition);
    if (information.status === "ready") return information;
    if (information.status === "failed") throw new Error(information.error);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Background analysis did not finish within five seconds");
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

function byteDifference(left: Uint8Array, right: Uint8Array): number {
  assert.equal(left.length, right.length);
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index]! - right[index]!);
  return total;
}

function byteTotal(bytes: Uint8Array): number {
  let total = 0;
  for (const byte of bytes) total += byte;
  return total;
}

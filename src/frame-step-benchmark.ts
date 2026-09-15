import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { FrameProxyCache } from "./frame-cache.js";
import { probeVideo } from "./probe.js";
import { runProcess } from "./process.js";

const sampleCount = 200;
const targetMilliseconds = 1000 / 30;

interface LatencySummary {
  readonly mean: number;
  readonly median: number;
  readonly p95: number;
  readonly maximum: number;
}

async function main(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "animation-study-frame-step-benchmark-"));
  try {
    const sourcePath = join(directory, "1080p frame step fixture.mp4");
    await runProcess("ffmpeg", [
      "-v", "error",
      "-f", "lavfi",
      "-i", "testsrc2=size=1920x1080:rate=24:duration=0.5",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-y",
      sourcePath,
    ]);

    const timing = await probeVideo(sourcePath);
    const cache = new FrameProxyCache({
      sourcePath,
      timing,
      cacheRoot: join(directory, "cache"),
      widthLimit: 1280,
      prefetchRadius: 2,
      maxEntries: 5,
    });

    await loadCachedFrame(cache, 0);
    await loadCachedFrame(cache, 1);
    await loadCachedFrame(cache, 0);

    const forward: number[] = [];
    const backward: number[] = [];
    for (let sample = 0; sample < sampleCount; sample += 1) {
      forward.push(await timeLoad(cache, 1));
      backward.push(await timeLoad(cache, 0));
    }

    const forwardSummary = summarize(forward);
    const backwardSummary = summarize(backward);
    console.log(`Cached frame-step target: ${format(targetMilliseconds)} ms`);
    console.log(`Fixture: 1920x1080 H.264 source, 1280x720 PNG proxies, ${sampleCount} samples per direction`);
    console.log(`Forward:  mean ${format(forwardSummary.mean)} ms, median ${format(forwardSummary.median)} ms, p95 ${format(forwardSummary.p95)} ms, max ${format(forwardSummary.maximum)} ms`);
    console.log(`Backward: mean ${format(backwardSummary.mean)} ms, median ${format(backwardSummary.median)} ms, p95 ${format(backwardSummary.p95)} ms, max ${format(backwardSummary.maximum)} ms`);

    if (forwardSummary.maximum > targetMilliseconds || backwardSummary.maximum > targetMilliseconds) {
      process.exitCode = 1;
      console.error("The cached frame-step target was missed.");
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function timeLoad(cache: FrameProxyCache, timelinePosition: number): Promise<number> {
  const started = performance.now();
  await loadCachedFrame(cache, timelinePosition);
  return performance.now() - started;
}

async function loadCachedFrame(cache: FrameProxyCache, timelinePosition: number): Promise<void> {
  const proxy = await cache.getFrame(timelinePosition);
  const image = await readFile(proxy.path);
  image.toString("base64");
}

function summarize(samples: readonly number[]): LatencySummary {
  const ordered = [...samples].sort((left, right) => left - right);
  const mean = ordered.reduce((total, sample) => total + sample, 0) / ordered.length;
  return {
    mean,
    median: percentile(ordered, 0.5),
    p95: percentile(ordered, 0.95),
    maximum: ordered.at(-1)!,
  };
}

function percentile(orderedSamples: readonly number[], fraction: number): number {
  const index = Math.ceil(orderedSamples.length * fraction) - 1;
  return orderedSamples[Math.max(0, index)]!;
}

function format(milliseconds: number): string {
  return milliseconds.toFixed(3);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

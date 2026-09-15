import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AnalysisProxy, AnalysisProxySettings } from "./analysis-proxy.js";

export interface FrameComponentScore {
  readonly fromTimelinePosition: number;
  readonly toTimelinePosition: number;
  readonly lumaDifference: number;
  readonly chromaDifference: number;
  readonly edgeDifference: number;
}

export interface AnalysisScores {
  readonly schemaVersion: 1;
  readonly sourceFingerprint: string;
  readonly settings: AnalysisProxySettings;
  readonly frameCount: number;
  readonly boundaries: readonly FrameComponentScore[];
}

export class AnalysisScoreCache {
  readonly #proxy: AnalysisProxy;
  readonly #ffmpegExecutable: string;
  readonly #path: string;

  constructor(proxy: AnalysisProxy, ffmpegExecutable = "ffmpeg") {
    if (proxy.frameCount < 1) throw new Error("An analysis proxy must contain at least one frame");
    this.#proxy = proxy;
    this.#ffmpegExecutable = ffmpegExecutable;
    this.#path = join(dirname(proxy.path), "component-scores-v1.json");
  }

  async create(signal?: AbortSignal): Promise<AnalysisScores> {
    const cached = await this.#readCached();
    if (cached) return cached;

    const boundaries = await this.#calculate(signal);
    const scores: AnalysisScores = {
      schemaVersion: 1,
      sourceFingerprint: this.#proxy.sourceFingerprint,
      settings: this.#proxy.settings,
      frameCount: this.#proxy.frameCount,
      boundaries,
    };
    const temporaryPath = join(dirname(this.#path), `component-scores-${randomUUID()}.json`);
    try {
      await writeFile(temporaryPath, `${JSON.stringify(scores, null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.#path);
    } finally {
      await rm(temporaryPath, { force: true });
    }
    return scores;
  }

  async #calculate(signal?: AbortSignal): Promise<readonly FrameComponentScore[]> {
    const { width, height } = this.#proxy.settings;
    const pixelsPerFrame = width * height;
    const colorScores: { lumaDifference: number; chromaDifference: number }[] = [];
    let previousColor: Buffer | null = null;
    await streamRawFrames({
      executable: this.#ffmpegExecutable,
      args: [
        "-v", "error",
        "-i", this.#proxy.path,
        "-map", `0:v:${this.#proxy.lumaChromaStreamIndex}`,
        "-pix_fmt", "yuv444p",
        "-fps_mode", "passthrough",
        "-f", "rawvideo",
        "pipe:1",
      ],
      bytesPerFrame: pixelsPerFrame * 3,
      expectedFrameCount: this.#proxy.frameCount,
      signal,
      onFrame: (frame) => {
        if (previousColor) {
          colorScores.push({
            lumaDifference: normalizedDifference(previousColor, frame, 0, pixelsPerFrame),
            chromaDifference: normalizedDifference(previousColor, frame, pixelsPerFrame, pixelsPerFrame * 2),
          });
        }
        previousColor = frame;
      },
    });

    const edgeScores: number[] = [];
    let previousEdge: Buffer | null = null;
    await streamRawFrames({
      executable: this.#ffmpegExecutable,
      args: [
        "-v", "error",
        "-i", this.#proxy.path,
        "-map", `0:v:${this.#proxy.edgeStreamIndex}`,
        "-pix_fmt", "gray",
        "-fps_mode", "passthrough",
        "-f", "rawvideo",
        "pipe:1",
      ],
      bytesPerFrame: pixelsPerFrame,
      expectedFrameCount: this.#proxy.frameCount,
      signal,
      onFrame: (frame) => {
        if (previousEdge) edgeScores.push(normalizedDifference(previousEdge, frame, 0, pixelsPerFrame));
        previousEdge = frame;
      },
    });

    if (colorScores.length !== edgeScores.length) {
      throw new Error(`Analysis streams returned different boundary counts: ${colorScores.length} and ${edgeScores.length}`);
    }
    return colorScores.map((color, fromTimelinePosition) => ({
      fromTimelinePosition,
      toTimelinePosition: fromTimelinePosition + 1,
      lumaDifference: color.lumaDifference,
      chromaDifference: color.chromaDifference,
      edgeDifference: edgeScores[fromTimelinePosition]!,
    }));
  }

  async #readCached(): Promise<AnalysisScores | null> {
    try {
      const parsed = JSON.parse(await readFile(this.#path, "utf8")) as unknown;
      return isMatchingScores(parsed, this.#proxy) ? parsed : null;
    } catch {
      return null;
    }
  }
}

interface RawFrameStreamOptions {
  readonly executable: string;
  readonly args: readonly string[];
  readonly bytesPerFrame: number;
  readonly expectedFrameCount: number;
  readonly signal: AbortSignal | undefined;
  readonly onFrame: (frame: Buffer, frameIndex: number) => void;
}

function streamRawFrames(options: RawFrameStreamOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.executable, options.args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let pending: Buffer = Buffer.alloc(0);
    let frameCount = 0;
    let stderr = "";
    let callbackError: unknown;
    let settled = false;

    const abort = () => child.kill("SIGTERM");
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.stdout.on("data", (chunk: Buffer) => {
      if (callbackError) return;
      try {
        pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
        while (pending.length >= options.bytesPerFrame) {
          const frame = Buffer.from(pending.subarray(0, options.bytesPerFrame));
          pending = pending.subarray(options.bytesPerFrame);
          options.onFrame(frame, frameCount);
          frameCount += 1;
        }
      } catch (error) {
        callbackError = error;
        child.kill("SIGTERM");
      }
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (callbackError) return finish(callbackError);
      if (options.signal?.aborted) return finish(new Error(`${options.executable} was cancelled`));
      if (code !== 0) return finish(new Error(`${options.executable} exited with code ${code ?? -1}: ${stderr.trim()}`));
      if (pending.length !== 0) return finish(new Error(`Raw analysis output ended with ${pending.length} incomplete bytes`));
      if (frameCount !== options.expectedFrameCount) {
        return finish(new Error(`Analysis stream returned ${frameCount} frames; expected ${options.expectedFrameCount}`));
      }
      finish();
    });

    function finish(error?: unknown): void {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    }
  });
}

function normalizedDifference(left: Uint8Array, right: Uint8Array, offset: number, length: number): number {
  let total = 0;
  const end = offset + length;
  for (let index = offset; index < end; index += 1) total += Math.abs(left[index]! - right[index]!);
  return total / (length * 255);
}

function isMatchingScores(value: unknown, proxy: AnalysisProxy): value is AnalysisScores {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AnalysisScores>;
  if (
    candidate.schemaVersion !== 1 ||
    candidate.sourceFingerprint !== proxy.sourceFingerprint ||
    candidate.frameCount !== proxy.frameCount ||
    JSON.stringify(candidate.settings) !== JSON.stringify(proxy.settings) ||
    !Array.isArray(candidate.boundaries) ||
    candidate.boundaries.length !== proxy.frameCount - 1
  ) return false;

  return candidate.boundaries.every((boundary, index) => {
    if (!boundary || typeof boundary !== "object") return false;
    const score = boundary as Partial<FrameComponentScore>;
    return score.fromTimelinePosition === index &&
      score.toTimelinePosition === index + 1 &&
      isNormalized(score.lumaDifference) &&
      isNormalized(score.chromaDifference) &&
      isNormalized(score.edgeDifference);
  });
}

function isNormalized(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

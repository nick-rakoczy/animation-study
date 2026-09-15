import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { runProcess } from "./process.js";
import { rationalToDecimal, subtractRationals } from "./rational.js";
import type { NormalizedTiming } from "./timing.js";

export interface FrameProxy {
  readonly timelinePosition: number;
  readonly path: string;
  readonly widthLimit: number;
}

export interface FrameProxyCacheOptions {
  readonly sourcePath: string;
  readonly sourceFingerprint: string;
  readonly timing: NormalizedTiming;
  readonly cacheRoot: string;
  readonly ffmpegExecutable?: string;
  readonly widthLimit?: number;
  readonly prefetchRadius?: number;
  readonly maxEntries?: number;
}

/**
 * Stores a small moving window of display proxies. It never extracts a complete
 * source file unless the caller eventually visits every frame.
 */
export class FrameProxyCache {
  readonly #sourcePath: string;
  readonly #timing: NormalizedTiming;
  readonly #directory: string;
  readonly #ffmpegExecutable: string;
  readonly #widthLimit: number;
  readonly #prefetchRadius: number;
  readonly #maxEntries: number;
  readonly #recentlyUsed = new Map<number, string>();
  #activeDecode: Promise<void> | null = null;
  #readAheadAbortController: AbortController | null = null;
  #lastRequestedPosition: number | null = null;

  get directory(): string {
    return this.#directory;
  }

  constructor(options: FrameProxyCacheOptions) {
    if (!Number.isSafeInteger(options.widthLimit ?? 1280) || (options.widthLimit ?? 1280) < 16) {
      throw new Error("widthLimit must be an integer of at least 16 pixels");
    }
    if (!Number.isSafeInteger(options.prefetchRadius ?? 2) || (options.prefetchRadius ?? 2) < 0) {
      throw new Error("prefetchRadius must be a non-negative integer");
    }
    if (!Number.isSafeInteger(options.maxEntries ?? 180) || (options.maxEntries ?? 180) < 1) {
      throw new Error("maxEntries must be a positive integer");
    }

    this.#sourcePath = resolve(options.sourcePath);
    this.#timing = options.timing;
    this.#ffmpegExecutable = options.ffmpegExecutable ?? "ffmpeg";
    this.#widthLimit = options.widthLimit ?? 1280;
    this.#prefetchRadius = options.prefetchRadius ?? 2;
    this.#maxEntries = options.maxEntries ?? 180;
    if (!options.sourceFingerprint.startsWith("sha256:")) {
      throw new Error("A SHA-256 source fingerprint is required for the frame cache");
    }
    const sourceKey = createHash("sha256")
      .update(options.sourceFingerprint)
      .update("\0")
      .update(this.#widthLimit.toString())
      .digest("hex")
      .slice(0, 20);
    this.#directory = join(resolve(options.cacheRoot), `${basename(this.#sourcePath)}-${sourceKey}`);
  }

  async getFrame(timelinePosition: number, signal?: AbortSignal): Promise<FrameProxy> {
    this.#assertPosition(timelinePosition);
    const previousPosition = this.#lastRequestedPosition;
    this.#lastRequestedPosition = timelinePosition;
    await mkdir(this.#directory, { recursive: true });

    let path = this.#pathFor(timelinePosition);
    if (!(await fileExists(path))) {
      if (this.#activeDecode) {
        this.#readAheadAbortController?.abort();
        await this.#activeDecode;
      }
      if (!(await fileExists(path))) {
        const start = Math.max(0, timelinePosition - this.#prefetchRadius);
        const end = Math.min(this.#timing.frameCount - 1, timelinePosition + this.#prefetchRadius);
        const task = this.#decodeWindow(start, end, signal);
        this.#activeDecode = task;
        try {
          await task;
        } finally {
          if (this.#activeDecode === task) this.#activeDecode = null;
        }
      }
    }

    path = this.#pathFor(timelinePosition);
    if (!(await fileExists(path))) {
      throw new Error(`FFmpeg did not produce timeline frame ${timelinePosition}`);
    }
    this.#touch(timelinePosition, path);
    await this.#evictOldEntries(timelinePosition);
    const prefetchWindowSize = this.#prefetchRadius * 2 + 1;
    if (previousPosition !== null && this.#prefetchRadius > 0 && this.#maxEntries >= prefetchWindowSize * 2) {
      const direction = Math.sign(timelinePosition - previousPosition);
      if (direction !== 0) this.#startDirectionalPrefetch(timelinePosition, direction as -1 | 1);
    }
    return { timelinePosition, path, widthLimit: this.#widthLimit };
  }

  cachedPositions(): readonly number[] {
    return [...this.#recentlyUsed.keys()].sort((left, right) => left - right);
  }

  async clear(): Promise<void> {
    this.#readAheadAbortController?.abort();
    await this.#activeDecode;
    await rm(this.#directory, { force: true, recursive: true });
    this.#recentlyUsed.clear();
    this.#lastRequestedPosition = null;
  }

  #startDirectionalPrefetch(timelinePosition: number, direction: -1 | 1): void {
    if (this.#activeDecode) return;
    const windowSize = this.#prefetchRadius * 2 + 1;
    const abortController = new AbortController();
    const task = (async () => {
      let firstMissing = timelinePosition + direction;
      while (firstMissing >= 0 && firstMissing < this.#timing.frameCount) {
        if (!(await fileExists(this.#pathFor(firstMissing)))) break;
        firstMissing += direction;
      }
      if (firstMissing < 0 || firstMissing >= this.#timing.frameCount) return;

      const start = direction > 0
        ? firstMissing
        : Math.max(0, firstMissing - windowSize + 1);
      const end = direction > 0
        ? Math.min(this.#timing.frameCount - 1, firstMissing + windowSize - 1)
        : firstMissing;
      await this.#decodeWindow(start, end, abortController.signal);
      await this.#evictOldEntries(timelinePosition);
    })().catch(() => {
      // Read-ahead is optional. A foreground request retries the frame and reports any decode error.
    });
    this.#activeDecode = task;
    this.#readAheadAbortController = abortController;
    void task.finally(() => {
      if (this.#activeDecode === task) {
        this.#activeDecode = null;
        this.#readAheadAbortController = null;
      }
    });
  }

  #assertPosition(timelinePosition: number): void {
    if (!Number.isSafeInteger(timelinePosition) || timelinePosition < 0 || timelinePosition >= this.#timing.frameCount) {
      throw new RangeError(`Timeline position ${timelinePosition} is outside 0-${this.#timing.frameCount - 1}`);
    }
  }

  async #decodeWindow(start: number, end: number, signal?: AbortSignal): Promise<void> {
    const temporaryDirectory = join(this.#directory, `.decode-${randomUUID()}`);
    await mkdir(temporaryDirectory, { recursive: true });
    const startFrame = this.#timing.frames[start]!;
    const relativeTimestamp = subtractRationals(
      startFrame.presentationTimestamp,
      this.#timing.firstPresentationTimestamp,
    );
    const frameCount = end - start + 1;
    const outputPattern = join(temporaryDirectory, "%08d.png");
    const scale = [
      `w='min(iw,${this.#widthLimit})'`,
      `h='min(ih,${this.#widthLimit})'`,
      "force_original_aspect_ratio=decrease",
      "force_divisible_by=2",
    ].join(":");

    try {
      await runProcess(
        this.#ffmpegExecutable,
        [
          "-v", "error",
          "-ss", rationalToDecimal(relativeTimestamp, 12),
          "-i", this.#sourcePath,
          "-map", "0:v:0",
          "-an",
          "-vf", `scale=${scale}`,
          "-frames:v", frameCount.toString(),
          "-fps_mode", "passthrough",
          "-start_number", start.toString(),
          "-y",
          outputPattern,
        ],
        signal,
      );

      const decodedNames = (await readdir(temporaryDirectory)).filter((name) => name.endsWith(".png"));
      if (decodedNames.length !== frameCount) {
        throw new Error(`FFmpeg returned ${decodedNames.length} frames for the requested ${frameCount}-frame window`);
      }
      for (const name of decodedNames) {
        const position = Number.parseInt(name.slice(0, -4), 10);
        const finalPath = this.#pathFor(position);
        await rename(join(temporaryDirectory, name), finalPath);
        this.#touch(position, finalPath);
      }
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  }

  #pathFor(timelinePosition: number): string {
    return join(this.#directory, `${timelinePosition.toString().padStart(8, "0")}.png`);
  }

  #touch(timelinePosition: number, path: string): void {
    this.#recentlyUsed.delete(timelinePosition);
    this.#recentlyUsed.set(timelinePosition, path);
  }

  async #evictOldEntries(protectedPosition: number): Promise<void> {
    while (this.#recentlyUsed.size > this.#maxEntries) {
      const oldest = this.#recentlyUsed.entries().next().value as [number, string] | undefined;
      if (!oldest) return;
      const [position, path] = oldest;
      this.#recentlyUsed.delete(position);
      if (position !== protectedPosition) await rm(path, { force: true });
    }
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

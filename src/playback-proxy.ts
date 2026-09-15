import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { runProcess } from "./process.js";
import type { NormalizedTiming } from "./timing.js";

export interface PlaybackProxyOptions {
  readonly sourcePath: string;
  readonly timing: NormalizedTiming;
  readonly cacheRoot: string;
  readonly ffmpegExecutable?: string;
  readonly widthLimit?: number;
}

export class PlaybackProxy {
  readonly #sourcePath: string;
  readonly #directory: string;
  readonly #path: string;
  readonly #ffmpegExecutable: string;
  readonly #widthLimit: number;

  constructor(options: PlaybackProxyOptions) {
    if (!Number.isSafeInteger(options.widthLimit ?? 1280) || (options.widthLimit ?? 1280) < 16) {
      throw new Error("widthLimit must be an integer of at least 16 pixels");
    }
    this.#sourcePath = resolve(options.sourcePath);
    this.#ffmpegExecutable = options.ffmpegExecutable ?? "ffmpeg";
    this.#widthLimit = options.widthLimit ?? 1280;
    const sourceKey = createHash("sha256")
      .update(this.#sourcePath)
      .update("\0")
      .update(options.timing.frameCount.toString())
      .update("\0")
      .update(JSON.stringify(options.timing.firstPresentationTimestamp))
      .digest("hex")
      .slice(0, 20);
    this.#directory = join(resolve(options.cacheRoot), `${basename(this.#sourcePath)}-${sourceKey}-playback`);
    this.#path = join(this.#directory, "source.webm");
  }

  async create(signal?: AbortSignal): Promise<string> {
    if (await fileExists(this.#path)) return this.#path;
    await mkdir(this.#directory, { recursive: true });
    const temporaryPath = join(this.#directory, `playback-${randomUUID()}.webm`);
    const scale = [
      `w='min(iw,${this.#widthLimit})'`,
      `h='min(ih,${this.#widthLimit})'`,
      "force_original_aspect_ratio=decrease",
      "force_divisible_by=2",
    ].join(":");

    try {
      await runProcess(this.#ffmpegExecutable, [
        "-v", "error",
        "-i", this.#sourcePath,
        "-map", "0:v:0",
        "-map", "0:a:0?",
        "-vf", `scale=${scale}`,
        "-fps_mode", "passthrough",
        "-c:v", "libvpx-vp9",
        "-deadline", "realtime",
        "-cpu-used", "8",
        "-row-mt", "1",
        "-crf", "32",
        "-b:v", "0",
        "-c:a", "libopus",
        "-b:a", "128k",
        "-y",
        temporaryPath,
      ], signal);
      await rename(temporaryPath, this.#path);
      return this.#path;
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  async clear(): Promise<void> {
    await rm(this.#directory, { force: true, recursive: true });
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

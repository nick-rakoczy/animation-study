import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { runProcess } from "./process.js";
import type { NormalizedTiming } from "./timing.js";

export interface AnalysisProxySettings {
  readonly width: number;
  readonly height: number;
  readonly edgeLowThreshold: number;
  readonly edgeHighThreshold: number;
}

export interface AnalysisProxy {
  readonly path: string;
  readonly sourceFingerprint: string;
  readonly settings: AnalysisProxySettings;
  readonly frameCount: number;
  readonly lumaChromaStreamIndex: 0;
  readonly edgeStreamIndex: 1;
}

export interface AnalysisProxyCacheOptions {
  readonly sourcePath: string;
  readonly timing: NormalizedTiming;
  readonly cacheRoot: string;
  readonly ffmpegExecutable?: string;
  readonly settings?: Partial<AnalysisProxySettings>;
}

const defaultSettings: AnalysisProxySettings = {
  width: 64,
  height: 36,
  edgeLowThreshold: 0.1,
  edgeHighThreshold: 0.4,
};

export class AnalysisProxyCache {
  readonly #sourcePath: string;
  readonly #timing: NormalizedTiming;
  readonly #cacheRoot: string;
  readonly #ffmpegExecutable: string;
  readonly #settings: AnalysisProxySettings;
  #directory: string | null = null;

  constructor(options: AnalysisProxyCacheOptions) {
    this.#sourcePath = resolve(options.sourcePath);
    this.#timing = options.timing;
    this.#cacheRoot = resolve(options.cacheRoot);
    this.#ffmpegExecutable = options.ffmpegExecutable ?? "ffmpeg";
    this.#settings = { ...defaultSettings, ...options.settings };
    validateSettings(this.#settings);
  }

  async create(signal?: AbortSignal): Promise<AnalysisProxy> {
    const sourceFingerprint = await this.#sourceFingerprint();
    const settingsKey = createHash("sha256")
      .update(sourceFingerprint)
      .update("\0")
      .update(JSON.stringify(this.#settings))
      .digest("hex")
      .slice(0, 20);
    const directory = join(this.#cacheRoot, `${basename(this.#sourcePath)}-${settingsKey}-analysis`);
    const path = join(directory, "analysis.mkv");
    this.#directory = directory;

    if (!(await fileExists(path))) {
      await mkdir(directory, { recursive: true });
      const temporaryPath = join(directory, `analysis-${randomUUID()}.mkv`);
      const filter = [
        `[0:v:0]scale=${this.#settings.width}:${this.#settings.height}:flags=area,format=yuv444p,split=2[color][edge-source]`,
        `[edge-source]edgedetect=low=${this.#settings.edgeLowThreshold}:high=${this.#settings.edgeHighThreshold},format=gray[edge]`,
      ].join(";");

      try {
        await runProcess(this.#ffmpegExecutable, [
          "-v", "error",
          "-i", this.#sourcePath,
          "-filter_complex", filter,
          "-map", "[color]",
          "-map", "[edge]",
          "-an",
          "-c:v", "ffv1",
          "-level", "3",
          "-g", "1",
          "-fps_mode:v:0", "passthrough",
          "-fps_mode:v:1", "passthrough",
          "-map_metadata", "-1",
          "-y",
          temporaryPath,
        ], signal);
        await rename(temporaryPath, path);
      } finally {
        await rm(temporaryPath, { force: true });
      }
    }

    return {
      path,
      sourceFingerprint,
      settings: this.#settings,
      frameCount: this.#timing.frameCount,
      lumaChromaStreamIndex: 0,
      edgeStreamIndex: 1,
    };
  }

  async clear(): Promise<void> {
    if (this.#directory) await rm(this.#directory, { force: true, recursive: true });
    this.#directory = null;
  }

  async #sourceFingerprint(): Promise<string> {
    const sourceStat = await stat(this.#sourcePath, { bigint: true });
    return createHash("sha256")
      .update(this.#sourcePath)
      .update("\0")
      .update(sourceStat.size.toString())
      .update("\0")
      .update(sourceStat.mtimeNs.toString())
      .update("\0")
      .update(this.#timing.frameCount.toString())
      .update("\0")
      .update(JSON.stringify(this.#timing.firstPresentationTimestamp))
      .digest("hex");
  }
}

function validateSettings(settings: AnalysisProxySettings): void {
  if (!Number.isSafeInteger(settings.width) || settings.width < 16) {
    throw new Error("Analysis proxy width must be an integer of at least 16 pixels");
  }
  if (!Number.isSafeInteger(settings.height) || settings.height < 16) {
    throw new Error("Analysis proxy height must be an integer of at least 16 pixels");
  }
  if (!Number.isFinite(settings.edgeLowThreshold) || settings.edgeLowThreshold < 0 || settings.edgeLowThreshold > 1) {
    throw new Error("The low edge threshold must be from 0 through 1");
  }
  if (!Number.isFinite(settings.edgeHighThreshold) || settings.edgeHighThreshold < 0 || settings.edgeHighThreshold > 1) {
    throw new Error("The high edge threshold must be from 0 through 1");
  }
  if (settings.edgeLowThreshold > settings.edgeHighThreshold) {
    throw new Error("The low edge threshold cannot exceed the high edge threshold");
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

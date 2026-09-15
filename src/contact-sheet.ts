import { rename, rm } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { runProcess } from "./process.js";

export interface ContactSheetResult {
  readonly outputPath: string;
  readonly sampledTimelinePositions: readonly number[];
  readonly columns: number;
  readonly rows: number;
}

export async function createContactSheet(options: {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly frameCount: number;
  readonly sampleCount: number;
  readonly ffmpegExecutable?: string;
  readonly signal?: AbortSignal;
}): Promise<ContactSheetResult> {
  const positions = chooseSamplePositions(options.frameCount, options.sampleCount);
  const columns = Math.ceil(Math.sqrt(positions.length));
  const rows = Math.ceil(positions.length / columns);
  const extension = extname(options.outputPath) || ".png";
  const temporaryPath = join(dirname(options.outputPath), `.animstudy-${randomUUID()}${extension}`);
  const selection = positions.map((position) => `eq(n\\,${position})`).join("+");
  const filter = `select='${selection}',scale=320:-2,tile=${columns}x${rows}:padding=4:margin=4`;

  try {
    await runProcess(
      options.ffmpegExecutable ?? "ffmpeg",
      [
        "-v", "error",
        "-i", options.inputPath,
        "-map", "0:v:0",
        "-vf", filter,
        "-frames:v", "1",
        "-fps_mode", "vfr",
        "-y",
        temporaryPath,
      ],
      options.signal,
    );
    await rename(temporaryPath, options.outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }

  return { outputPath: options.outputPath, sampledTimelinePositions: positions, columns, rows };
}

export function chooseSamplePositions(frameCount: number, requestedCount: number): number[] {
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) throw new Error("frameCount must be a positive integer");
  if (!Number.isSafeInteger(requestedCount) || requestedCount < 1) throw new Error("sampleCount must be a positive integer");
  const count = Math.min(frameCount, requestedCount);
  if (count === 1) return [0];
  return Array.from({ length: count }, (_, index) => Math.round((index * (frameCount - 1)) / (count - 1)));
}

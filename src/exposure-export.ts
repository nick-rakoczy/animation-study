import { constants } from "node:fs";
import { access, copyFile, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { ExposureTimeline } from "./exposure-span.js";
import { runProcess } from "./process.js";
import type { InclusiveTimelineRange } from "./timeline-range.js";

export interface ExposureExportOptions {
  readonly sourcePath: string;
  readonly outputDirectory: string;
  readonly timeline: ExposureTimeline;
  readonly range: InclusiveTimelineRange;
  readonly ffmpegExecutable?: string;
  readonly signal?: AbortSignal;
  readonly commitFile?: typeof copyFile;
}

export interface ExposureExportResult {
  readonly outputDirectory: string;
  readonly exportedTimelinePositions: readonly number[];
  readonly paths: readonly string[];
}

export class ExposureExportCancelledError extends Error {
  constructor() {
    super("Export cancelled");
    this.name = "ExposureExportCancelledError";
  }
}

export async function exportExposureSelection(
  options: ExposureExportOptions,
): Promise<ExposureExportResult> {
  assertRange(options.range, options.timeline.frameCount);
  throwIfCancelled(options.signal);
  const positions = representativePositionsInRange(options.timeline, options.range);
  if (positions.length === 0) throw new Error("The selected range contains no exposures");

  const exportRoot = resolve(options.outputDirectory);
  await mkdir(exportRoot, { recursive: true });
  const sourceFolderName = `${basename(options.sourcePath)}_frames`;
  const startingFrameNumber = options.range.startPosition + 1;
  const names = exportFileNames(startingFrameNumber, positions.length);
  const stagingDirectory = await mkdtemp(join(exportRoot, `.${sourceFolderName}-export-`));
  const selection = positions.map((position) => `eq(n\\,${position})`).join("+");

  try {
    await runProcess(
      options.ffmpegExecutable ?? "ffmpeg",
      [
        "-v", "error",
        "-i", resolve(options.sourcePath),
        "-map", "0:v:0",
        "-an",
        "-vf", `select='${selection}',format=rgb24`,
        "-frames:v", positions.length.toString(),
        "-fps_mode", "passthrough",
        "-start_number", "1",
        "-n",
        join(stagingDirectory, `${startingFrameNumber}_%04d.png`),
      ],
      options.signal,
    );
    throwIfCancelled(options.signal);
    await assertCompleteStagingDirectory(stagingDirectory, names);

    const finalDirectory = await chooseExportDirectory(exportRoot, sourceFolderName, names);
    const finalDirectoryCreated = await createDirectoryIfMissing(finalDirectory);
    const committedPaths: string[] = [];
    try {
      for (const name of names) {
        throwIfCancelled(options.signal);
        const destination = join(finalDirectory, name);
        await (options.commitFile ?? copyFile)(
          join(stagingDirectory, name),
          destination,
          constants.COPYFILE_EXCL,
        );
        committedPaths.push(destination);
      }
      return {
        outputDirectory: finalDirectory,
        exportedTimelinePositions: positions,
        paths: committedPaths,
      };
    } catch (error) {
      await Promise.all(committedPaths.map((path) => rm(path, { force: true })));
      if (finalDirectoryCreated) await rm(finalDirectory, { force: true, recursive: true });
      throw error;
    }
  } catch (error) {
    if (options.signal?.aborted) throw new ExposureExportCancelledError();
    throw error;
  } finally {
    await rm(stagingDirectory, { force: true, recursive: true });
  }
}

export function representativePositionsInRange(
  timeline: ExposureTimeline,
  range: InclusiveTimelineRange,
): readonly number[] {
  assertRange(range, timeline.frameCount);
  return timeline.spans
    .filter((span) => (
      span.startTimelinePosition <= range.endPosition
      && span.endTimelinePosition >= range.startPosition
    ))
    .map((span) => span.representativeTimelinePosition);
}

export function exportFileNames(
  startingSourceFrameNumber: number,
  exposureCount: number,
): readonly string[] {
  if (!Number.isSafeInteger(startingSourceFrameNumber) || startingSourceFrameNumber < 1) {
    throw new Error("The starting source frame number must be a positive integer");
  }
  if (!Number.isSafeInteger(exposureCount) || exposureCount < 1) {
    throw new Error("The exposure count must be a positive integer");
  }
  return Array.from({ length: exposureCount }, (_, index) => (
    `${startingSourceFrameNumber}_${(index + 1).toString().padStart(4, "0")}.png`
  ));
}

async function chooseExportDirectory(
  root: string,
  sourceFolderName: string,
  names: readonly string[],
): Promise<string> {
  for (let number = 1; ; number += 1) {
    const suffix = number === 1 ? "" : `_${number}`;
    const candidate = join(root, `${sourceFolderName}${suffix}`);
    if (!(await pathExists(candidate))) return candidate;
    if (!(await stat(candidate)).isDirectory()) continue;
    const collisions = await Promise.all(names.map((name) => pathExists(join(candidate, name))));
    if (collisions.every((collision) => !collision)) return candidate;
  }
}

async function createDirectoryIfMissing(path: string): Promise<boolean> {
  if (await pathExists(path)) return false;
  await mkdir(path);
  return true;
}

async function assertCompleteStagingDirectory(
  stagingDirectory: string,
  names: readonly string[],
): Promise<void> {
  const actualNames = (await readdir(stagingDirectory)).sort();
  const expectedNames = [...names].sort();
  if (
    actualNames.length !== expectedNames.length
    || actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    throw new Error(`FFmpeg produced ${actualNames.length} files for ${expectedNames.length} exposures`);
  }
  for (const name of names) {
    if ((await stat(join(stagingDirectory, name))).size === 0) {
      throw new Error(`FFmpeg produced an empty export file ${name}`);
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ExposureExportCancelledError();
}

function assertRange(range: InclusiveTimelineRange, frameCount: number): void {
  if (
    !Number.isSafeInteger(range.startPosition)
    || !Number.isSafeInteger(range.endPosition)
    || range.startPosition < 0
    || range.endPosition < range.startPosition
    || range.endPosition >= frameCount
    || range.frameCount !== range.endPosition - range.startPosition + 1
  ) {
    throw new Error("Export range is outside the source or inconsistent");
  }
}

#!/usr/bin/env node
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { createContactSheet } from "./contact-sheet.js";
import { probeVideo } from "./probe.js";
import { ProcessError } from "./process.js";

interface CliOptions {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly contactSheetPath: string;
  readonly sampleCount: number;
  readonly ffmpegExecutable: string;
  readonly ffprobeExecutable: string;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  await mkdir(dirname(options.outputPath), { recursive: true });
  await mkdir(dirname(options.contactSheetPath), { recursive: true });

  const abortController = new AbortController();
  for (const event of ["SIGINT", "SIGTERM"] as const) {
    process.once(event, () => abortController.abort());
  }

  process.stderr.write(`Reading frame timing from ${options.inputPath}\n`);
  const timing = await probeVideo(options.inputPath, options.ffprobeExecutable, abortController.signal);
  process.stderr.write(`Found ${timing.frameCount} video frames\n`);

  process.stderr.write(`Creating contact sheet at ${options.contactSheetPath}\n`);
  const contactSheet = await createContactSheet({
    inputPath: options.inputPath,
    outputPath: options.contactSheetPath,
    frameCount: timing.frameCount,
    sampleCount: options.sampleCount,
    ffmpegExecutable: options.ffmpegExecutable,
    signal: abortController.signal,
  });

  const document = {
    generatedAt: new Date().toISOString(),
    sourcePath: options.inputPath,
    ...timing,
    contactSheet: {
      path: contactSheet.outputPath,
      sampledTimelinePositions: contactSheet.sampledTimelinePositions,
      columns: contactSheet.columns,
      rows: contactSheet.rows,
    },
  };
  await writeJsonAtomically(options.outputPath, document);
  process.stdout.write(`${options.outputPath}\n${options.contactSheetPath}\n`);
}

function parseArguments(args: readonly string[]): CliOptions {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(args.length === 0 ? 2 : 0);
  }

  let inputPath: string | undefined;
  let outputPath: string | undefined;
  let contactSheetPath: string | undefined;
  let sampleCount = 25;
  let ffmpegExecutable = "ffmpeg";
  let ffprobeExecutable = "ffprobe";

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    const takeValue = () => {
      const value = args[++index];
      if (!value) throw new Error(`${argument} requires a value`);
      return value;
    };
    if (argument === "--output") outputPath = takeValue();
    else if (argument === "--contact-sheet") contactSheetPath = takeValue();
    else if (argument === "--samples") sampleCount = Number(takeValue());
    else if (argument === "--ffmpeg") ffmpegExecutable = takeValue();
    else if (argument === "--ffprobe") ffprobeExecutable = takeValue();
    else if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    else if (inputPath) throw new Error(`Unexpected second input path: ${argument}`);
    else inputPath = argument;
  }

  if (!inputPath) throw new Error("A video path is required");
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > 100) {
    throw new Error("--samples must be an integer from 1 through 100");
  }

  const absoluteInput = resolve(inputPath);
  const defaultStem = resolve(`${basename(inputPath)}.timing`);
  return {
    inputPath: absoluteInput,
    outputPath: resolve(outputPath ?? `${defaultStem}.json`),
    contactSheetPath: resolve(contactSheetPath ?? `${defaultStem}.png`),
    sampleCount,
    ffmpegExecutable,
    ffprobeExecutable,
  };
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function printUsage(): void {
  process.stdout.write(`Usage: animation-study-probe <video> [options]\n\nOptions:\n  --output <path>         Timing JSON output path\n  --contact-sheet <path>  Contact sheet PNG output path\n  --samples <count>       Contact sheet samples, 1-100 (default: 25)\n  --ffmpeg <path>         FFmpeg executable (default: ffmpeg)\n  --ffprobe <path>        ffprobe executable (default: ffprobe)\n  -h, --help              Show this help\n`);
}

main().catch((error: unknown) => {
  if (error instanceof ProcessError) {
    process.stderr.write(`${error.message}\n`);
    if (error.result?.stderr) process.stderr.write(error.result.stderr);
  } else {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.exitCode = 1;
});

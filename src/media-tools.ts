import { dirname, join, win32 } from "node:path";
import { ProcessError, runProcess } from "./process.js";
import type { MediaToolStatus } from "./app-contract.js";

export interface MediaToolExecutables {
  readonly ffmpegExecutable: string;
  readonly ffprobeExecutable: string;
}

export function resolveMediaTools(ffmpegPath: string | null = null, platform = process.platform): MediaToolExecutables {
  if (!ffmpegPath) return { ffmpegExecutable: "ffmpeg", ffprobeExecutable: "ffprobe" };
  const paths = platform === "win32" ? win32 : { dirname, join };
  return {
    ffmpegExecutable: ffmpegPath,
    ffprobeExecutable: paths.join(paths.dirname(ffmpegPath), platform === "win32" ? "ffprobe.exe" : "ffprobe"),
  };
}

export async function getMediaToolStatus(ffmpegPath: string | null = null, platform = process.platform): Promise<MediaToolStatus> {
  const executables = resolveMediaTools(ffmpegPath, platform);
  const configuration = { canConfigure: platform === "win32", ffmpegPath };
  try {
    const [ffmpeg, ffprobe] = await Promise.all([
      readVersion(executables.ffmpegExecutable),
      readVersion(executables.ffprobeExecutable),
    ]);
    return {
      ...configuration,
      available: true,
      ffmpegVersion: ffmpeg,
      ffprobeVersion: ffprobe,
      error: null,
    };
  } catch (error) {
    return {
      ...configuration,
      available: false,
      ffmpegVersion: null,
      ffprobeVersion: null,
      error: describeProcessFailure(error, platform),
    };
  }
}

async function readVersion(executable: string): Promise<string> {
  const result = await runProcess(executable, ["-version"]);
  const firstLine = result.stdout.split(/\r?\n/, 1)[0]?.trim();
  if (!firstLine) throw new Error(`${executable} returned no version information`);
  return firstLine;
}

function describeProcessFailure(error: unknown, platform: NodeJS.Platform): string {
  if (error instanceof ProcessError) {
    return `${error.executable} is unavailable. ${mediaToolInstallationGuidance(platform)}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export function mediaToolInstallationGuidance(platform = process.platform): string {
  if (platform === "win32") {
    return "Download a Windows build from ffmpeg.org, then use Choose FFmpeg to select ffmpeg.exe in its bin folder. Keep ffprobe.exe in the same folder.";
  }
  if (platform === "linux") {
    return "Install the ffmpeg package with your Linux distribution's package manager, then restart Animation Study.";
  }
  return "Install FFmpeg and make sure both ffmpeg and ffprobe are on PATH.";
}

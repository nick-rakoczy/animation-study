import { ProcessError, runProcess } from "./process.js";
import type { MediaToolStatus } from "./app-contract.js";

export async function getMediaToolStatus(): Promise<MediaToolStatus> {
  try {
    const [ffmpeg, ffprobe] = await Promise.all([
      readVersion("ffmpeg"),
      readVersion("ffprobe"),
    ]);
    return {
      available: true,
      ffmpegVersion: ffmpeg,
      ffprobeVersion: ffprobe,
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      ffmpegVersion: null,
      ffprobeVersion: null,
      error: describeProcessFailure(error),
    };
  }
}

async function readVersion(executable: string): Promise<string> {
  const result = await runProcess(executable, ["-version"]);
  const firstLine = result.stdout.split(/\r?\n/, 1)[0]?.trim();
  if (!firstLine) throw new Error(`${executable} returned no version information`);
  return firstLine;
}

function describeProcessFailure(error: unknown): string {
  if (error instanceof ProcessError) {
    return `${error.executable} is unavailable. ${mediaToolInstallationGuidance()}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export function mediaToolInstallationGuidance(platform = process.platform): string {
  if (platform === "win32") {
    return "Download a Windows build from ffmpeg.org, then add its bin folder to PATH. Restart Animation Study afterward.";
  }
  if (platform === "linux") {
    return "Install the ffmpeg package with your Linux distribution's package manager, then restart Animation Study.";
  }
  return "Install FFmpeg and make sure both ffmpeg and ffprobe are on PATH.";
}

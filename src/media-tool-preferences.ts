import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function loadFfmpegPath(preferencesPath: string): string | null {
  try {
    const preferences: unknown = JSON.parse(readFileSync(preferencesPath, "utf8"));
    if (preferences && typeof preferences === "object" && "ffmpegPath" in preferences) {
      const path = preferences.ffmpegPath;
      if (typeof path === "string" && path.trim()) return path;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Could not read FFmpeg preferences", error);
    }
  }
  return null;
}

export function saveFfmpegPath(preferencesPath: string, ffmpegPath: string | null): void {
  mkdirSync(dirname(preferencesPath), { recursive: true });
  const temporaryPath = `${preferencesPath}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify({ ffmpegPath }, null, 2), "utf8");
  renameSync(temporaryPath, preferencesPath);
}

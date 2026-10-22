import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFfmpegPath, saveFfmpegPath } from "../src/media-tool-preferences.js";
import { getMediaToolStatus, resolveMediaTools, mediaToolInstallationGuidance } from "../src/media-tools.js";

test("reports platform-specific FFmpeg installation guidance", () => {
  assert.match(mediaToolInstallationGuidance("linux"), /distribution's package manager/);
  assert.match(mediaToolInstallationGuidance("win32"), /Windows build/);
  assert.match(mediaToolInstallationGuidance("darwin"), /both ffmpeg and ffprobe/);
});

test("resolves Windows FFmpeg and sibling ffprobe without changing PATH", () => {
  assert.deepEqual(resolveMediaTools("C:\\Program Files\\FFmpeg\\bin\\ffmpeg.exe", "win32"), {
    ffmpegExecutable: "C:\\Program Files\\FFmpeg\\bin\\ffmpeg.exe",
    ffprobeExecutable: "C:\\Program Files\\FFmpeg\\bin\\ffprobe.exe",
  });
  assert.deepEqual(resolveMediaTools(null, "win32"), {
    ffmpegExecutable: "ffmpeg",
    ffprobeExecutable: "ffprobe",
  });
});

test("remembers the FFmpeg selection across launches and can clear it", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "animation-study-preferences-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const preferencesPath = join(directory, "preferences", "media-tools.json");
  assert.equal(loadFfmpegPath(preferencesPath), null);
  const executable = "C:\\Program Files\\FFmpeg\\bin\\ffmpeg.exe";
  saveFfmpegPath(preferencesPath, executable);
  assert.equal(loadFfmpegPath(preferencesPath), executable);
  saveFfmpegPath(preferencesPath, null);
  assert.equal(loadFfmpegPath(preferencesPath), null);
  await writeFile(preferencesPath, JSON.stringify({ ffmpegPath: 123 }));
  assert.equal(loadFfmpegPath(preferencesPath), null);
});

test("reports a missing saved executable while keeping Windows configuration available", async () => {
  const executable = "C:\\missing-ffmpeg-build\\ffmpeg.exe";
  const status = await getMediaToolStatus(executable, "win32");
  assert.equal(status.available, false);
  assert.equal(status.canConfigure, true);
  assert.equal(status.ffmpegPath, executable);
  assert.match(status.error!, /Choose FFmpeg/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { mediaToolInstallationGuidance } from "../src/media-tools.js";

test("reports platform-specific FFmpeg installation guidance", () => {
  assert.match(mediaToolInstallationGuidance("linux"), /distribution's package manager/);
  assert.match(mediaToolInstallationGuidance("win32"), /Windows build/);
  assert.match(mediaToolInstallationGuidance("darwin"), /both ffmpeg and ffprobe/);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createContactSheet } from "../src/contact-sheet.js";
import { probeVideo } from "../src/probe.js";

const execFileAsync = promisify(execFile);

test("probes a real 24000/1001 video and creates a contact sheet", async (context) => {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
  } catch {
    context.skip("ffmpeg and ffprobe are required for this integration test");
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "animation-study-test-"));
  const videoPath = join(directory, "timing fixture.mp4");
  const contactSheetPath = join(directory, "contact sheet.png");
  await execFileAsync("ffmpeg", [
    "-v", "error",
    "-f", "lavfi",
    "-i", "testsrc2=size=160x90:rate=24000/1001:duration=0.25",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-y",
    videoPath,
  ]);

  const timing = await probeVideo(videoPath);
  assert.equal(timing.frameCount, 6);
  assert.deepEqual(timing.stream.averageFrameRate, { numerator: "24000", denominator: "1001" });
  assert.deepEqual(timing.frames.map((frame) => frame.timelinePosition), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(timing.frames[5]!.presentationDuration, { numerator: "1001", denominator: "24000" });

  const sheet = await createContactSheet({
    inputPath: videoPath,
    outputPath: contactSheetPath,
    frameCount: timing.frameCount,
    sampleCount: 4,
  });
  assert.deepEqual(sheet.sampledTimelinePositions, [0, 2, 3, 5]);
  assert.ok((await stat(contactSheetPath)).size > 0);
});

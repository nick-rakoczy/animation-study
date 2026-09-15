import assert from "node:assert/strict";
import { chmod, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ExposureExportCancelledError,
  exportExposureSelection,
  exportFileNames,
  representativePositionsInRange,
} from "../src/exposure-export.js";
import type { ExposureTimeline } from "../src/exposure-span.js";

const timeline: ExposureTimeline = {
  schemaVersion: 1,
  sourceFingerprint: "export-fixture",
  proxySettings: { width: 64, height: 36, edgeLowThreshold: 0.1, edgeHighThreshold: 0.4 },
  classificationSettings: { sameThreshold: 0.01, changedThreshold: 0.04 },
  frameCount: 8,
  spans: [
    {
      id: "exposure-a",
      exposureIndex: 0,
      displayCelNumber: 1,
      startTimelinePosition: 0,
      endTimelinePosition: 2,
      frameCount: 3,
      representativeTimelinePosition: 1,
    },
    {
      id: "exposure-b",
      exposureIndex: 1,
      displayCelNumber: 2,
      startTimelinePosition: 3,
      endTimelinePosition: 4,
      frameCount: 2,
      representativeTimelinePosition: 4,
    },
    {
      id: "exposure-c",
      exposureIndex: 2,
      displayCelNumber: 3,
      startTimelinePosition: 5,
      endTimelinePosition: 7,
      frameCount: 3,
      representativeTimelinePosition: 6,
    },
  ],
  reviewBoundaries: [],
};

test("selects one representative for every exposure crossing an inclusive range", () => {
  assert.deepEqual(representativePositionsInRange(timeline, {
    startPosition: 2,
    endPosition: 5,
    frameCount: 4,
  }), [1, 4, 6]);
  assert.deepEqual(representativePositionsInRange(timeline, {
    startPosition: 3,
    endPosition: 3,
    frameCount: 1,
  }), [4]);
});

test("rejects an inconsistent export range", () => {
  assert.throws(() => representativePositionsInRange(timeline, {
    startPosition: 2,
    endPosition: 5,
    frameCount: 3,
  }), /inconsistent/);
});

test("restarts zero-padded cel names and keeps the selected starting frame prefix", () => {
  assert.deepEqual(exportFileNames(1234, 3), [
    "1234_0001.png",
    "1234_0002.png",
    "1234_0003.png",
  ]);
  assert.equal(exportFileNames(7, 10_000)[9_999], "7_10000.png");
});

test("removes staged files when export is cancelled", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "animation-study-cancelled-export-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const fakeFfmpeg = join(directory, "fake-ffmpeg.cjs");
  await writeFile(fakeFfmpeg, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const output = process.argv.at(-1).replace('%04d', '0001');",
    "fs.writeFileSync(output, 'partial export');",
    "setTimeout(() => {}, 10000);",
  ].join("\n"));
  await chmod(fakeFfmpeg, 0o755);
  const abortController = new AbortController();
  const exporting = exportExposureSelection({
    sourcePath: join(directory, "source.mp4"),
    outputDirectory: join(directory, "output"),
    timeline,
    range: { startPosition: 3, endPosition: 3, frameCount: 1 },
    ffmpegExecutable: fakeFfmpeg,
    signal: abortController.signal,
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  abortController.abort();
  await assert.rejects(exporting, (error) => error instanceof ExposureExportCancelledError);
  assert.deepEqual(await readdir(join(directory, "output")), []);
});

test("removes staged files when the decoder fails", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "animation-study-failed-export-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const fakeFfmpeg = join(directory, "fake-ffmpeg.cjs");
  await writeFile(fakeFfmpeg, [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const output = process.argv.at(-1).replace('%04d', '0001');",
    "fs.writeFileSync(output, 'partial export');",
    "process.exit(1);",
  ].join("\n"));
  await chmod(fakeFfmpeg, 0o755);
  await assert.rejects(exportExposureSelection({
    sourcePath: join(directory, "source.mp4"),
    outputDirectory: join(directory, "output"),
    timeline,
    range: { startPosition: 3, endPosition: 3, frameCount: 1 },
    ffmpegExecutable: fakeFfmpeg,
  }), /exited with code 1/);
  assert.deepEqual(await readdir(join(directory, "output")), []);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { AnalysisProxyCache } from "../src/analysis-proxy.js";
import { AnalysisScoreCache, type AnalysisScores } from "../src/analysis-score.js";
import { classifyBoundaries, defaultBoundaryClassificationSettings } from "../src/boundary-classifier.js";
import { buildExposureSpans } from "../src/exposure-span.js";
import { probeVideo } from "../src/probe.js";

const execFileAsync = promisify(execFile);

interface DetectorFixture {
  readonly name: string;
  readonly ffmpegArgs: readonly string[];
  readonly expectedClassifications: readonly ("same" | "changed")[];
}

const detectorFixtures: readonly DetectorFixture[] = [
  {
    name: "clean-hold",
    ffmpegArgs: ["-f", "lavfi", "-i", "color=c=#202020:s=160x90:r=6:d=1"],
    expectedClassifications: ["same", "same", "same", "same", "same"],
  },
  {
    name: "compressed-noisy-hold",
    ffmpegArgs: [
      "-f", "lavfi", "-i", "color=c=#808080:s=160x90:r=6:d=1",
      "-vf", "drawbox=x=28:y=18:w=104:h=54:color=#303030:t=fill,drawbox=x=50:y=28:w=60:h=34:color=#d0d0d0:t=3,noise=alls=2:allf=t+u",
      "-crf", "38",
    ],
    expectedClassifications: ["same", "same", "same", "same", "same"],
  },
  {
    name: "camera-motion",
    ffmpegArgs: [
      "-f", "lavfi", "-i", "testsrc=size=320x90:rate=6:duration=1",
      "-vf", "crop=160:90:x=n*24:y=0",
      "-crf", "12",
    ],
    expectedClassifications: ["changed", "changed", "changed", "changed", "changed"],
  },
  {
    name: "dissolve",
    ffmpegArgs: [
      "-f", "lavfi", "-i", "color=c=red:s=160x90:r=6:d=1",
      "-vf", "fade=t=out:st=0:d=0.84:color=blue",
      "-crf", "12",
    ],
    expectedClassifications: ["changed", "changed", "changed", "changed", "changed"],
  },
  {
    name: "variable-frame-rate",
    ffmpegArgs: [
      "-f", "lavfi", "-i", "color=c=black:s=160x90:r=10:d=0.4",
      "-vf", "drawbox=x=30:y=15:w=100:h=60:color=white:t=fill:enable='gte(n,2)',settb=1/1000,setpts=if(eq(N\\,0)\\,0\\,if(eq(N\\,1)\\,100\\,if(eq(N\\,2)\\,300\\,600)))",
      "-fps_mode", "vfr",
      "-crf", "12",
    ],
    expectedClassifications: ["same", "changed", "same"],
  },
  {
    name: "returning-drawing",
    ffmpegArgs: [
      "-f", "lavfi", "-i", "color=c=black:s=160x90:r=6:d=1",
      "-vf", "drawbox=x=30:y=15:w=100:h=60:color=white:t=fill:enable='between(n,2,3)'",
      "-crf", "12",
    ],
    expectedClassifications: ["same", "changed", "same", "changed", "same"],
  },
  {
    name: "single-frame-drawing",
    ffmpegArgs: [
      "-f", "lavfi", "-i", "color=c=black:s=160x90:r=5:d=1",
      "-vf", "drawbox=x=30:y=15:w=100:h=60:color=white:t=fill:enable='eq(n,2)'",
      "-crf", "12",
    ],
    expectedClassifications: ["same", "changed", "changed", "same"],
  },
];

test("classifies the detector fixture set at the default thresholds", async (context) => {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
  } catch {
    context.skip("ffmpeg and ffprobe are required for detector fixture tests");
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "animation-study-detector-fixtures-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const results = new Map<string, AnalysisScores>();

  for (const fixture of detectorFixtures) {
    const sourcePath = join(directory, `${fixture.name}.mp4`);
    await execFileAsync("ffmpeg", [
      "-v", "error",
      ...fixture.ffmpegArgs,
      "-an",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-y",
      sourcePath,
    ]);
    const timing = await probeVideo(sourcePath);
    assert.equal(timing.frameCount, fixture.expectedClassifications.length + 1, fixture.name);
    if (fixture.name === "variable-frame-rate") {
      assert.ok(
        new Set(timing.frames.map((frame) => JSON.stringify(frame.presentationDuration))).size > 1,
        "variable-frame-rate must contain different presentation durations",
      );
    }
    const proxyCache = new AnalysisProxyCache({
      sourcePath,
      timing,
      cacheRoot: join(directory, "cache"),
    });
    const scores = await new AnalysisScoreCache(await proxyCache.create()).create();
    results.set(fixture.name, scores);
    const classified = classifyBoundaries(scores);
    assert.deepEqual(
      classified.boundaries.map((boundary) => boundary.classification),
      fixture.expectedClassifications,
      fixture.name,
    );
  }

  const noisyHoldMaximum = maximumDifference(results.get("compressed-noisy-hold")!);
  const deliberateChanges = detectorFixtures
    .filter((fixture) => fixture.expectedClassifications.includes("changed"))
    .flatMap((fixture) => {
      const scores = results.get(fixture.name)!;
      return scores.boundaries
        .filter((_, index) => fixture.expectedClassifications[index] === "changed")
        .map(strongestDifference);
    });
  const deliberateChangeMinimum = Math.min(...deliberateChanges);
  assert.ok(noisyHoldMaximum <= defaultBoundaryClassificationSettings.sameThreshold);
  assert.ok(deliberateChangeMinimum >= defaultBoundaryClassificationSettings.changedThreshold);
  context.diagnostic(
    `Noisy hold maximum ${noisyHoldMaximum.toFixed(6)}; deliberate change minimum ${deliberateChangeMinimum.toFixed(6)}`,
  );

  const returningTimeline = buildExposureSpans(classifyBoundaries(results.get("returning-drawing")!));
  assert.deepEqual(
    returningTimeline.spans.map((span) => [span.startTimelinePosition, span.endTimelinePosition]),
    [[0, 1], [2, 3], [4, 5]],
  );
});

function maximumDifference(scores: AnalysisScores): number {
  return Math.max(...scores.boundaries.map(strongestDifference));
}

function strongestDifference(score: AnalysisScores["boundaries"][number]): number {
  return Math.max(score.lumaDifference, score.chromaDifference, score.edgeDifference);
}

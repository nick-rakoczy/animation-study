import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { ApplicationService } from "./main/application-service.js";

async function main(): Promise<void> {
  const [sourceArgument, outputArgument, cacheArgument] = process.argv.slice(2);
  if (!sourceArgument || !outputArgument || !cacheArgument) {
    throw new Error("Usage: release-smoke <source> <output-directory> <cache-directory>");
  }
  const sourcePath = resolve(sourceArgument);
  const outputDirectory = resolve(outputArgument);
  const cacheRoot = resolve(cacheArgument);
  await Promise.all([
    mkdir(outputDirectory, { recursive: true }),
    mkdir(cacheRoot, { recursive: true }),
  ]);

  const firstService = new ApplicationService(cacheRoot);
  const firstOpen = await firstService.openVideo(sourcePath);
  await waitForAnalysis(firstService);

  const reopenedService = new ApplicationService(cacheRoot);
  const reopened = await reopenedService.openVideo(sourcePath);
  const reopenedStatus = await waitForAnalysis(reopenedService);
  const exported = await reopenedService.exportSelection({
    startPosition: 0,
    endPosition: reopened.playbackFrames.length - 1,
    frameCount: reopened.playbackFrames.length,
  }, outputDirectory);

  process.stdout.write(`${JSON.stringify({
    sourceFrameCount: firstOpen.playbackFrames.length,
    reopenedFromSidecar: reopenedStatus.loadedFromSidecar,
    exportedFrameCount: exported.paths.length,
    outputDirectory: exported.outputDirectory,
  })}\n`);
}

async function waitForAnalysis(
  service: ApplicationService,
): Promise<{ readonly status: "ready"; readonly loadedFromSidecar: boolean }> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const status = service.getBackgroundAnalysisStatus();
    if (status.status === "ready") return status;
    if (status.status === "failed") throw new Error(status.error);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Analysis did not finish within 60 seconds");
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});

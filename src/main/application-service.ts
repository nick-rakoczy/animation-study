import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { AnalysisCancelledError, type AnalysisJobProgress } from "../analysis-job.js";
import { AnalysisProject } from "../analysis-project.js";
import { AnalysisProxyCache } from "../analysis-proxy.js";
import { AnalysisScoreCache } from "../analysis-score.js";
import { AnalysisSensitivity, defaultAnalysisSensitivity } from "../analysis-sensitivity.js";
import { adjacentCelStartPosition, celInformationForFrame } from "../cel-information.js";
import { chooseSamplePositions } from "../contact-sheet.js";
import { applyExposureCorrection, correctionStateForFrame, type ExposureCorrectionAction } from "../exposure-correction.js";
import { exportExposureSelection, type ExposureExportResult } from "../exposure-export.js";
import type { ExposureTimeline } from "../exposure-span.js";
import { FrameProxyCache } from "../frame-cache.js";
import { createPlaybackFrames } from "../playback.js";
import { PlaybackProxy } from "../playback-proxy.js";
import { probeVideo } from "../probe.js";
import type { BackgroundAnalysisStatus, CelInformation, CelNavigationResult, CorrectionInformation, OpenVideoResult, TimelineThumbnail } from "../app-contract.js";
import type { NormalizedTiming } from "../timing.js";
import type { InclusiveTimelineRange } from "../timeline-range.js";
import { sourceContentFingerprint } from "../source-fingerprint.js";
import { clearCacheDirectories, type CacheCleanupResult } from "../cache-cleanup.js";

interface VideoSession {
  readonly sourcePath: string;
  readonly sourceFingerprint: string;
  readonly timing: NormalizedTiming;
  readonly thumbnailCache: FrameProxyCache;
  readonly playback: PlaybackProxy;
  readonly project: AnalysisProject;
  readonly analysisAbortController: AbortController;
  readonly thumbnailAbortController: AbortController;
  analysisTimeline: ExposureTimeline | null;
  analysisError: string | null;
  analysisProgress: AnalysisJobProgress | null;
  analysisLoadedFromSidecar: boolean | null;
  readonly correctionUndoStack: ExposureTimeline[];
  readonly correctionRedoStack: ExposureTimeline[];
}

export class ApplicationService {
  #session: VideoSession | null = null;
  #exportAbortController: AbortController | null = null;

  constructor(readonly cacheRoot: string) {}

  async openVideo(sourcePath: string): Promise<OpenVideoResult> {
    this.#exportAbortController?.abort();
    this.#session?.analysisAbortController.abort();
    this.#session?.thumbnailAbortController.abort();
    await this.#session?.thumbnailCache.clear();
    await this.#session?.playback.clear();
    const timing = await probeVideo(sourcePath);
    const sourceFingerprint = await sourceContentFingerprint(sourcePath);
    const thumbnailCache = new FrameProxyCache({
      sourcePath,
      sourceFingerprint,
      timing,
      cacheRoot: this.cacheRoot,
      widthLimit: 160,
      prefetchRadius: 0,
      maxEntries: 100,
    });
    const playback = new PlaybackProxy({ sourcePath, sourceFingerprint, timing, cacheRoot: this.cacheRoot });
    const project = new AnalysisProject(sourcePath);
    const playbackPath = await playback.create();
    const session: VideoSession = {
      sourcePath,
      sourceFingerprint,
      timing,
      thumbnailCache,
      playback,
      project,
      analysisAbortController: new AbortController(),
      thumbnailAbortController: new AbortController(),
      analysisTimeline: null,
      analysisError: null,
      analysisProgress: null,
      analysisLoadedFromSidecar: null,
      correctionUndoStack: [],
      correctionRedoStack: [],
    };
    this.#session = session;
    void this.#analyze(session);
    return {
      sourcePath,
      sourceName: basename(sourcePath),
      playbackUrl: pathToFileURL(playbackPath).href,
      codec: timing.stream.codec,
      width: timing.stream.width,
      height: timing.stream.height,
      averageFrameRate: timing.stream.averageFrameRate,
      playbackFrames: createPlaybackFrames(timing),
    };
  }

  getBackgroundAnalysisStatus(): BackgroundAnalysisStatus {
    const session = this.#session;
    if (!session) throw new Error("Open a video before requesting analysis status");
    if (session.analysisError) return { status: "failed", error: session.analysisError };
    if (session.analysisTimeline) {
      return { status: "ready", loadedFromSidecar: session.analysisLoadedFromSidecar ?? false };
    }
    return { status: "running", progress: session.analysisProgress };
  }

  async getCelInformation(timelinePosition: number): Promise<CelInformation> {
    const session = this.#session;
    if (!session) throw new Error("Open a video before requesting cel information");
    if (!session.timing.frames[timelinePosition]) {
      throw new Error(`Timeline position ${timelinePosition} is outside the source`);
    }
    if (session.analysisError) return { status: "failed", error: session.analysisError };
    if (!session.analysisTimeline) return { status: "pending" };
    return celInformationForFrame(session.timing, session.analysisTimeline, timelinePosition);
  }

  async getAdjacentCelPosition(
    timelinePosition: number,
    direction: "previous" | "next",
  ): Promise<CelNavigationResult> {
    const session = this.#session;
    if (!session) throw new Error("Open a video before navigating cels");
    if (!session.timing.frames[timelinePosition]) {
      throw new Error(`Timeline position ${timelinePosition} is outside the source`);
    }
    if (session.analysisError) return { status: "failed", error: session.analysisError };
    if (!session.analysisTimeline) return { status: "pending" };
    return {
      status: "ready",
      timelinePosition: adjacentCelStartPosition(session.analysisTimeline, timelinePosition, direction),
    };
  }

  async getCorrectionInformation(timelinePosition: number): Promise<CorrectionInformation> {
    const session = this.#session;
    if (!session) throw new Error("Open a video before requesting correction information");
    if (!session.timing.frames[timelinePosition]) {
      throw new Error(`Timeline position ${timelinePosition} is outside the source`);
    }
    if (session.analysisError) return { status: "failed", error: session.analysisError };
    if (!session.analysisTimeline) return { status: "pending" };
    return {
      status: "ready",
      ...correctionStateForFrame(session.analysisTimeline, timelinePosition),
      canUndo: session.correctionUndoStack.length > 0,
      canRedo: session.correctionRedoStack.length > 0,
    };
  }

  async applyExposureCorrection(action: ExposureCorrectionAction): Promise<void> {
    const session = this.#session;
    if (!session) throw new Error("Open a video before applying an exposure correction");
    if (!session.analysisTimeline) throw new Error("Exposure analysis is not ready");
    const corrected = applyExposureCorrection(session.analysisTimeline, action);
    session.project.saveCorrection(corrected);
    session.correctionUndoStack.push(session.analysisTimeline);
    session.correctionRedoStack.length = 0;
    session.analysisTimeline = corrected;
  }

  async undoExposureCorrection(): Promise<void> {
    const session = this.#session;
    if (!session?.analysisTimeline) throw new Error("Exposure analysis is not ready");
    const previous = session.correctionUndoStack.at(-1);
    if (!previous) return;
    session.project.saveCorrection(previous);
    session.correctionUndoStack.pop();
    session.correctionRedoStack.push(session.analysisTimeline);
    session.analysisTimeline = previous;
  }

  async redoExposureCorrection(): Promise<void> {
    const session = this.#session;
    if (!session?.analysisTimeline) throw new Error("Exposure analysis is not ready");
    const next = session.correctionRedoStack.at(-1);
    if (!next) return;
    session.project.saveCorrection(next);
    session.correctionRedoStack.pop();
    session.correctionUndoStack.push(session.analysisTimeline);
    session.analysisTimeline = next;
  }

  async getTimelineThumbnails(sampleCount: number): Promise<readonly TimelineThumbnail[]> {
    const session = this.#session;
    if (!session) throw new Error("Open a video before requesting timeline thumbnails");
    if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > 100) {
      throw new Error("Timeline sample count must be an integer from 1 through 100");
    }

    const thumbnails: TimelineThumbnail[] = [];
    for (const timelinePosition of chooseSamplePositions(session.timing.frameCount, sampleCount)) {
      const proxy = await session.thumbnailCache.getFrame(
        timelinePosition,
        session.thumbnailAbortController.signal,
      );
      const image = await readFile(proxy.path);
      thumbnails.push({
        timelinePosition,
        displayFrameNumber: session.timing.frames[timelinePosition]!.displayFrameNumber,
        imageDataUrl: `data:image/png;base64,${image.toString("base64")}`,
      });
    }
    return thumbnails;
  }

  async exportSelection(
    range: InclusiveTimelineRange,
    outputDirectory: string,
  ): Promise<ExposureExportResult> {
    const session = this.#session;
    if (!session) throw new Error("Open a video before exporting exposures");
    if (session.analysisError) throw new Error(session.analysisError);
    if (!session.analysisTimeline) throw new Error("Exposure analysis is not ready");
    if (this.#exportAbortController) throw new Error("An export is already running");
    const abortController = new AbortController();
    this.#exportAbortController = abortController;
    try {
      return await exportExposureSelection({
        sourcePath: session.sourcePath,
        outputDirectory,
        timeline: session.analysisTimeline,
        range,
        signal: abortController.signal,
      });
    } finally {
      if (this.#exportAbortController === abortController) this.#exportAbortController = null;
    }
  }

  cancelExport(): void {
    this.#exportAbortController?.abort();
  }

  async clearUnusedCache(): Promise<CacheCleanupResult> {
    const session = this.#session;
    if (session && !session.analysisTimeline && !session.analysisError) {
      throw new Error("Wait for background analysis to finish before clearing the cache");
    }
    const preserved = session
      ? [session.thumbnailCache.directory, session.playback.directory]
      : [];
    return clearCacheDirectories(this.cacheRoot, preserved);
  }

  async #analyze(session: VideoSession): Promise<void> {
    const signal = session.analysisAbortController.signal;
    try {
      const proxyCache = new AnalysisProxyCache({
        sourcePath: session.sourcePath,
        sourceFingerprint: session.sourceFingerprint,
        timing: session.timing,
        cacheRoot: this.cacheRoot,
      });
      const identity = await proxyCache.identity();
      session.project.saveSource(session.timing, identity.sourceFingerprint);
      const resolved = await session.project.loadCompletedOrAnalyze(identity, async () => {
        const reportProgress = (progress: AnalysisJobProgress) => {
          if (!signal.aborted) session.analysisProgress = progress;
        };
        const proxy = await proxyCache.create(signal, reportProgress);
        const scores = await new AnalysisScoreCache(proxy).create(signal, reportProgress);
        const analysis = new AnalysisSensitivity(defaultAnalysisSensitivity).analyze(scores);
        return {
          scores,
          timeline: analysis.timeline,
          sensitivity: analysis.sensitivity,
        };
      });
      if (!signal.aborted) {
        session.analysisTimeline = resolved.snapshot.timeline;
        session.analysisLoadedFromSidecar = resolved.loadedFromSidecar;
      }
    } catch (error) {
      if (signal.aborted || error instanceof AnalysisCancelledError) return;
      session.analysisError = error instanceof Error ? error.message : String(error);
    }
  }
}

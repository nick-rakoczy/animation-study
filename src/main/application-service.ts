import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { AnalysisCancelledError } from "../analysis-job.js";
import { AnalysisProject } from "../analysis-project.js";
import { AnalysisProxyCache } from "../analysis-proxy.js";
import { AnalysisScoreCache } from "../analysis-score.js";
import { AnalysisSensitivity, defaultAnalysisSensitivity } from "../analysis-sensitivity.js";
import { adjacentCelStartPosition, celInformationForFrame } from "../cel-information.js";
import { chooseSamplePositions } from "../contact-sheet.js";
import type { ExposureTimeline } from "../exposure-span.js";
import { FrameProxyCache } from "../frame-cache.js";
import { createPlaybackFrames } from "../playback.js";
import { PlaybackProxy } from "../playback-proxy.js";
import { probeVideo } from "../probe.js";
import type { CelInformation, CelNavigationResult, DisplayFrame, OpenVideoResult, TimelineThumbnail } from "../app-contract.js";
import type { NormalizedTiming } from "../timing.js";

interface VideoSession {
  readonly sourcePath: string;
  readonly timing: NormalizedTiming;
  readonly cache: FrameProxyCache;
  readonly thumbnailCache: FrameProxyCache;
  readonly playback: PlaybackProxy;
  readonly analysisAbortController: AbortController;
  readonly thumbnailAbortController: AbortController;
  analysisTimeline: ExposureTimeline | null;
  analysisError: string | null;
}

export class ApplicationService {
  #session: VideoSession | null = null;

  constructor(readonly cacheRoot: string) {}

  async openVideo(sourcePath: string): Promise<OpenVideoResult> {
    this.#session?.analysisAbortController.abort();
    this.#session?.thumbnailAbortController.abort();
    await this.#session?.thumbnailCache.clear();
    await this.#session?.playback.clear();
    const timing = await probeVideo(sourcePath);
    const cache = new FrameProxyCache({
      sourcePath,
      timing,
      cacheRoot: this.cacheRoot,
    });
    const thumbnailCache = new FrameProxyCache({
      sourcePath,
      timing,
      cacheRoot: this.cacheRoot,
      widthLimit: 160,
      prefetchRadius: 0,
      maxEntries: 100,
    });
    const playback = new PlaybackProxy({ sourcePath, timing, cacheRoot: this.cacheRoot });
    // Persistent reuse waits for the source-content fingerprint work. Clearing
    // here prevents a replaced source file from showing stale proxies.
    await Promise.all([cache.clear(), thumbnailCache.clear(), playback.clear()]);
    const playbackPath = await playback.create();
    const session: VideoSession = {
      sourcePath,
      timing,
      cache,
      thumbnailCache,
      playback,
      analysisAbortController: new AbortController(),
      thumbnailAbortController: new AbortController(),
      analysisTimeline: null,
      analysisError: null,
    };
    this.#session = session;
    const frame = await this.getFrame(0);
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
      frame,
    };
  }

  async getFrame(timelinePosition: number): Promise<DisplayFrame> {
    const session = this.#session;
    if (!session) throw new Error("Open a video before requesting a frame");
    const proxy = await session.cache.getFrame(timelinePosition);
    const timing = session.timing.frames[timelinePosition]!;
    const image = await readFile(proxy.path);
    return {
      timelinePosition,
      displayFrameNumber: timing.displayFrameNumber,
      frameCount: session.timing.frameCount,
      presentationTimestamp: timing.presentationTimestamp,
      presentationDuration: timing.presentationDuration,
      imageDataUrl: `data:image/png;base64,${image.toString("base64")}`,
    };
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

  async #analyze(session: VideoSession): Promise<void> {
    const signal = session.analysisAbortController.signal;
    try {
      const proxyCache = new AnalysisProxyCache({
        sourcePath: session.sourcePath,
        timing: session.timing,
        cacheRoot: this.cacheRoot,
      });
      const identity = await proxyCache.identity();
      const project = new AnalysisProject(session.sourcePath);
      const resolved = await project.loadCompletedOrAnalyze(identity, async () => {
        const proxy = await proxyCache.create(signal);
        const scores = await new AnalysisScoreCache(proxy).create(signal);
        const analysis = new AnalysisSensitivity(defaultAnalysisSensitivity).analyze(scores);
        return {
          scores,
          timeline: analysis.timeline,
          sensitivity: analysis.sensitivity,
        };
      });
      if (!signal.aborted) session.analysisTimeline = resolved.snapshot.timeline;
    } catch (error) {
      if (signal.aborted || error instanceof AnalysisCancelledError) return;
      session.analysisError = error instanceof Error ? error.message : String(error);
    }
  }
}

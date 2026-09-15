import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { FrameProxyCache } from "../frame-cache.js";
import { createPlaybackFrames } from "../playback.js";
import { PlaybackProxy } from "../playback-proxy.js";
import { probeVideo } from "../probe.js";
import type { DisplayFrame, OpenVideoResult } from "../app-contract.js";
import type { NormalizedTiming } from "../timing.js";

interface VideoSession {
  readonly sourcePath: string;
  readonly timing: NormalizedTiming;
  readonly cache: FrameProxyCache;
  readonly playback: PlaybackProxy;
}

export class ApplicationService {
  #session: VideoSession | null = null;

  constructor(readonly cacheRoot: string) {}

  async openVideo(sourcePath: string): Promise<OpenVideoResult> {
    await this.#session?.playback.clear();
    const timing = await probeVideo(sourcePath);
    const cache = new FrameProxyCache({
      sourcePath,
      timing,
      cacheRoot: this.cacheRoot,
    });
    const playback = new PlaybackProxy({ sourcePath, timing, cacheRoot: this.cacheRoot });
    // Persistent reuse waits for the source-content fingerprint work. Clearing
    // here prevents a replaced source file from showing stale proxies.
    await Promise.all([cache.clear(), playback.clear()]);
    const playbackPath = await playback.create();
    this.#session = { sourcePath, timing, cache, playback };
    const frame = await this.getFrame(0);
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
}

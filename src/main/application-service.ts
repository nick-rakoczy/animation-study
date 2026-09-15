import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { FrameProxyCache } from "../frame-cache.js";
import { probeVideo } from "../probe.js";
import type { DisplayFrame, OpenVideoResult } from "../app-contract.js";
import type { NormalizedTiming } from "../timing.js";

interface VideoSession {
  readonly sourcePath: string;
  readonly timing: NormalizedTiming;
  readonly cache: FrameProxyCache;
}

export class ApplicationService {
  #session: VideoSession | null = null;

  constructor(readonly cacheRoot: string) {}

  async openVideo(sourcePath: string): Promise<OpenVideoResult> {
    const timing = await probeVideo(sourcePath);
    const cache = new FrameProxyCache({
      sourcePath,
      timing,
      cacheRoot: this.cacheRoot,
    });
    // Persistent reuse waits for the source-content fingerprint work. Clearing
    // here prevents a replaced source file from showing stale proxies.
    await cache.clear();
    this.#session = { sourcePath, timing, cache };
    const frame = await this.getFrame(0);
    return {
      sourcePath,
      sourceName: basename(sourcePath),
      codec: timing.stream.codec,
      width: timing.stream.width,
      height: timing.stream.height,
      averageFrameRate: timing.stream.averageFrameRate,
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

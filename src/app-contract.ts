import type { Rational } from "./rational.js";

export interface MediaToolStatus {
  readonly available: boolean;
  readonly ffmpegVersion: string | null;
  readonly ffprobeVersion: string | null;
  readonly error: string | null;
}

export interface DisplayFrame {
  readonly timelinePosition: number;
  readonly displayFrameNumber: number;
  readonly frameCount: number;
  readonly presentationTimestamp: Rational;
  readonly presentationDuration: Rational;
  readonly imageDataUrl: string;
}

export interface OpenVideoResult {
  readonly sourcePath: string;
  readonly sourceName: string;
  readonly codec: string | null;
  readonly width: number;
  readonly height: number;
  readonly averageFrameRate: Rational | null;
  readonly frame: DisplayFrame;
}

export interface AnimationStudyApi {
  getMediaToolStatus(): Promise<MediaToolStatus>;
  openVideo(): Promise<OpenVideoResult | null>;
  getFrame(timelinePosition: number): Promise<DisplayFrame>;
}

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

export interface PlaybackFrame {
  readonly timelinePosition: number;
  readonly displayFrameNumber: number;
  readonly presentationTimestamp: Rational;
  readonly presentationDuration: Rational;
  readonly playbackTimestamp: Rational;
}

export interface TimelineThumbnail {
  readonly timelinePosition: number;
  readonly displayFrameNumber: number;
  readonly imageDataUrl: string;
}

export interface OpenVideoResult {
  readonly sourcePath: string;
  readonly sourceName: string;
  readonly playbackUrl: string;
  readonly codec: string | null;
  readonly width: number;
  readonly height: number;
  readonly averageFrameRate: Rational | null;
  readonly playbackFrames: readonly PlaybackFrame[];
  readonly frame: DisplayFrame;
}

export type CelInformation =
  | { readonly status: "pending" }
  | { readonly status: "failed"; readonly error: string }
  | {
      readonly status: "ready";
      readonly displayCelNumber: number;
      readonly exposureStartFrameNumber: number;
      readonly holdLengthFrames: number;
      readonly cadenceLabel: string;
      readonly elapsedDuration: Rational;
    };

export interface AnimationStudyApi {
  getMediaToolStatus(): Promise<MediaToolStatus>;
  openVideo(): Promise<OpenVideoResult | null>;
  getFrame(timelinePosition: number): Promise<DisplayFrame>;
  getCelInformation(timelinePosition: number): Promise<CelInformation>;
  getTimelineThumbnails(sampleCount: number): Promise<readonly TimelineThumbnail[]>;
}

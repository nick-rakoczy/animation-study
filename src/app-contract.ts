import type { Rational } from "./rational.js";
import type { ExposureCorrectionAction, ExposureCorrectionState } from "./exposure-correction.js";
import type { AnalysisJobProgress } from "./analysis-job.js";
import type { InclusiveTimelineRange } from "./timeline-range.js";

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

export type CelNavigationResult =
  | { readonly status: "pending" }
  | { readonly status: "failed"; readonly error: string }
  | { readonly status: "ready"; readonly timelinePosition: number | null };

export type CorrectionInformation =
  | { readonly status: "pending" }
  | { readonly status: "failed"; readonly error: string }
  | ({ readonly status: "ready"; readonly canUndo: boolean; readonly canRedo: boolean } & ExposureCorrectionState);

export type BackgroundAnalysisStatus =
  | { readonly status: "running"; readonly progress: AnalysisJobProgress | null }
  | { readonly status: "ready"; readonly loadedFromSidecar: boolean }
  | { readonly status: "failed"; readonly error: string };

export interface ExportSelectionResult {
  readonly outputDirectory: string;
  readonly exportedFrameCount: number;
}

export interface CacheCleanupResult {
  readonly removedFileCount: number;
  readonly removedBytes: number;
}

export interface AnimationStudyApi {
  getMediaToolStatus(): Promise<MediaToolStatus>;
  openVideo(): Promise<OpenVideoResult | null>;
  getFrame(timelinePosition: number): Promise<DisplayFrame>;
  getBackgroundAnalysisStatus(): Promise<BackgroundAnalysisStatus>;
  getCelInformation(timelinePosition: number): Promise<CelInformation>;
  getAdjacentCelPosition(timelinePosition: number, direction: "previous" | "next"): Promise<CelNavigationResult>;
  getCorrectionInformation(timelinePosition: number): Promise<CorrectionInformation>;
  applyExposureCorrection(action: ExposureCorrectionAction): Promise<void>;
  undoExposureCorrection(): Promise<void>;
  redoExposureCorrection(): Promise<void>;
  getTimelineThumbnails(sampleCount: number): Promise<readonly TimelineThumbnail[]>;
  exportSelection(range: InclusiveTimelineRange): Promise<ExportSelectionResult | null>;
  cancelExport(): Promise<void>;
  clearUnusedCache(): Promise<CacheCleanupResult>;
}

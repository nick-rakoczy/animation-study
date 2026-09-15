export type AnalysisJobStage =
  | "analysis-proxy"
  | "luma-chroma-scores"
  | "edge-scores";

export interface AnalysisJobProgress {
  readonly stage: AnalysisJobStage;
  readonly completedFrames: number;
  readonly totalFrames: number;
  readonly fraction: number;
  readonly cached: boolean;
}

export type AnalysisProgressHandler = (progress: AnalysisJobProgress) => void;

export class AnalysisCancelledError extends Error {
  constructor() {
    super("Analysis was cancelled");
    this.name = "AnalysisCancelledError";
  }
}

export function reportAnalysisProgress(
  handler: AnalysisProgressHandler | undefined,
  stage: AnalysisJobStage,
  completedFrames: number,
  totalFrames: number,
  cached = false,
): void {
  if (!handler) return;
  const completed = Math.max(0, Math.min(Math.trunc(completedFrames), totalFrames));
  handler({
    stage,
    completedFrames: completed,
    totalFrames,
    fraction: totalFrames === 0 ? 1 : completed / totalFrames,
    cached,
  });
}

export function throwIfAnalysisCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AnalysisCancelledError();
}

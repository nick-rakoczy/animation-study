import type { AnalysisProxySettings } from "./analysis-proxy.js";
import type { AnalysisScores, FrameComponentScore } from "./analysis-score.js";

export type BoundaryClassification = "same" | "uncertain" | "changed";

export interface BoundaryClassificationSettings {
  readonly sameThreshold: number;
  readonly changedThreshold: number;
}

export interface ClassifiedBoundary extends FrameComponentScore {
  readonly strongestDifference: number;
  readonly classification: BoundaryClassification;
}

export interface ClassifiedAnalysis {
  readonly schemaVersion: 1;
  readonly sourceFingerprint: string;
  readonly proxySettings: AnalysisProxySettings;
  readonly classificationSettings: BoundaryClassificationSettings;
  readonly frameCount: number;
  readonly boundaries: readonly ClassifiedBoundary[];
}

export const defaultBoundaryClassificationSettings: BoundaryClassificationSettings = {
  sameThreshold: 0.01,
  changedThreshold: 0.04,
};

export function classifyBoundaries(
  scores: AnalysisScores,
  settingsOverride: Partial<BoundaryClassificationSettings> = {},
): ClassifiedAnalysis {
  const settings = { ...defaultBoundaryClassificationSettings, ...settingsOverride };
  validateSettings(settings);
  if (scores.frameCount < 1 || scores.boundaries.length !== scores.frameCount - 1) {
    throw new Error("Component scores must contain one boundary for each adjacent frame pair");
  }

  const boundaries = scores.boundaries.map((score, index): ClassifiedBoundary => {
    if (score.fromTimelinePosition !== index || score.toTimelinePosition !== index + 1) {
      throw new Error(`Component score ${index} does not describe adjacent timeline frames`);
    }
    validateComponentScore(score);
    const strongestDifference = Math.max(
      score.lumaDifference,
      score.chromaDifference,
      score.edgeDifference,
    );
    const classification = strongestDifference <= settings.sameThreshold
      ? "same"
      : strongestDifference >= settings.changedThreshold
        ? "changed"
        : "uncertain";
    return { ...score, strongestDifference, classification };
  });

  return {
    schemaVersion: 1,
    sourceFingerprint: scores.sourceFingerprint,
    proxySettings: scores.settings,
    classificationSettings: settings,
    frameCount: scores.frameCount,
    boundaries,
  };
}

function validateSettings(settings: BoundaryClassificationSettings): void {
  if (!isNormalized(settings.sameThreshold)) {
    throw new Error("The same threshold must be from 0 through 1");
  }
  if (!isNormalized(settings.changedThreshold)) {
    throw new Error("The changed threshold must be from 0 through 1");
  }
  if (settings.sameThreshold >= settings.changedThreshold) {
    throw new Error("The same threshold must be lower than the changed threshold");
  }
}

function validateComponentScore(score: FrameComponentScore): void {
  if (
    !isNormalized(score.lumaDifference) ||
    !isNormalized(score.chromaDifference) ||
    !isNormalized(score.edgeDifference)
  ) throw new Error("Component differences must be finite values from 0 through 1");
}

function isNormalized(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

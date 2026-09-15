import type { AnalysisScores } from "./analysis-score.js";
import {
  classifyBoundaries,
  defaultBoundaryClassificationSettings,
  type BoundaryClassificationSettings,
} from "./boundary-classifier.js";
import { buildExposureSpans, type ExposureTimeline } from "./exposure-span.js";

export const minimumAnalysisSensitivity = 0;
export const maximumAnalysisSensitivity = 100;
export const defaultAnalysisSensitivity = 50;

export interface SensitivityAnalysis {
  readonly sensitivity: number;
  readonly classificationSettings: BoundaryClassificationSettings;
  readonly timeline: ExposureTimeline;
}

export class AnalysisSensitivity {
  #value: number;

  constructor(initialValue = defaultAnalysisSensitivity) {
    validateSensitivity(initialValue);
    this.#value = initialValue;
  }

  get value(): number {
    return this.#value;
  }

  set(value: number): void {
    validateSensitivity(value);
    this.#value = value;
  }

  reset(): void {
    this.#value = defaultAnalysisSensitivity;
  }

  analyze(scores: AnalysisScores): SensitivityAnalysis {
    const classificationSettings = classificationSettingsForSensitivity(this.#value);
    const classified = classifyBoundaries(scores, classificationSettings);
    return {
      sensitivity: this.#value,
      classificationSettings,
      timeline: buildExposureSpans(classified),
    };
  }
}

export function classificationSettingsForSensitivity(sensitivity: number): BoundaryClassificationSettings {
  validateSensitivity(sensitivity);
  const thresholdScale = 1.5 - sensitivity / 100;
  return {
    sameThreshold: defaultBoundaryClassificationSettings.sameThreshold * thresholdScale,
    changedThreshold: defaultBoundaryClassificationSettings.changedThreshold * thresholdScale,
  };
}

function validateSensitivity(value: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value < minimumAnalysisSensitivity ||
    value > maximumAnalysisSensitivity
  ) throw new Error("Analysis sensitivity must be an integer from 0 through 100");
}

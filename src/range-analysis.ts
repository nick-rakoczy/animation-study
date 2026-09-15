import type { AnalysisScores } from "./analysis-score.js";
import {
  classifyBoundaries,
  type BoundaryClassificationSettings,
  type ClassifiedBoundary,
} from "./boundary-classifier.js";
import {
  classificationSettingsForSensitivity,
  defaultAnalysisSensitivity,
} from "./analysis-sensitivity.js";

export interface TimelineRange {
  readonly startTimelinePosition: number;
  readonly endTimelinePosition: number;
}

export interface SelectedRangeAnalysis extends TimelineRange {
  readonly sensitivity: number;
  readonly classificationSettings: BoundaryClassificationSettings;
  readonly frameCount: number;
  readonly boundaries: readonly ClassifiedBoundary[];
  readonly reviewBoundaries: readonly ClassifiedBoundary[];
  readonly previewCelCount: number;
}

export function analyzeSelectedRange(
  scores: AnalysisScores,
  range: TimelineRange,
  sensitivity = defaultAnalysisSensitivity,
): SelectedRangeAnalysis {
  validateRange(range, scores.frameCount);
  const classificationSettings = classificationSettingsForSensitivity(sensitivity);
  const analysis = classifyBoundaries(scores, classificationSettings);
  const boundaries = analysis.boundaries.slice(
    range.startTimelinePosition,
    range.endTimelinePosition,
  );
  const reviewBoundaries = boundaries.filter(
    (boundary) => boundary.classification === "uncertain",
  );
  const changedBoundaryCount = boundaries.filter(
    (boundary) => boundary.classification === "changed",
  ).length;

  return {
    ...range,
    sensitivity,
    classificationSettings,
    frameCount: range.endTimelinePosition - range.startTimelinePosition + 1,
    boundaries,
    reviewBoundaries,
    previewCelCount: changedBoundaryCount + 1,
  };
}

function validateRange(range: TimelineRange, sourceFrameCount: number): void {
  if (
    !Number.isSafeInteger(range.startTimelinePosition) ||
    !Number.isSafeInteger(range.endTimelinePosition)
  ) throw new Error("Timeline range positions must be integers");
  if (
    range.startTimelinePosition < 0 ||
    range.endTimelinePosition < range.startTimelinePosition ||
    range.endTimelinePosition >= sourceFrameCount
  ) throw new Error("Timeline range must be an inclusive range within the source");
}

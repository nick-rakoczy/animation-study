import type {
  BoundaryClassificationSettings,
  ClassifiedAnalysis,
  ClassifiedBoundary,
} from "./boundary-classifier.js";
import type { AnalysisProxySettings } from "./analysis-proxy.js";

export interface ExposureSpan {
  readonly id: string;
  readonly exposureIndex: number;
  readonly displayCelNumber: number;
  readonly startTimelinePosition: number;
  readonly endTimelinePosition: number;
  readonly frameCount: number;
  readonly representativeTimelinePosition: number;
}

export interface ExposureTimeline {
  readonly schemaVersion: 1;
  readonly sourceFingerprint: string;
  readonly proxySettings: AnalysisProxySettings;
  readonly classificationSettings: BoundaryClassificationSettings;
  readonly frameCount: number;
  readonly spans: readonly ExposureSpan[];
  readonly reviewBoundaries: readonly ClassifiedBoundary[];
}

export function buildExposureSpans(analysis: ClassifiedAnalysis): ExposureTimeline {
  if (analysis.frameCount < 1 || analysis.boundaries.length !== analysis.frameCount - 1) {
    throw new Error("Classified analysis must contain one boundary for each adjacent frame pair");
  }

  const spans: ExposureSpan[] = [];
  const reviewBoundaries: ClassifiedBoundary[] = [];
  let startTimelinePosition = 0;

  for (let index = 0; index < analysis.boundaries.length; index += 1) {
    const boundary = analysis.boundaries[index]!;
    if (boundary.fromTimelinePosition !== index || boundary.toTimelinePosition !== index + 1) {
      throw new Error(`Classified boundary ${index} does not describe adjacent timeline frames`);
    }
    if (boundary.classification === "uncertain") reviewBoundaries.push(boundary);
    if (boundary.classification !== "same") {
      spans.push(createSpan(spans.length, startTimelinePosition, boundary.fromTimelinePosition));
      startTimelinePosition = boundary.toTimelinePosition;
    }
  }

  spans.push(createSpan(spans.length, startTimelinePosition, analysis.frameCount - 1));
  return {
    schemaVersion: 1,
    sourceFingerprint: analysis.sourceFingerprint,
    proxySettings: analysis.proxySettings,
    classificationSettings: analysis.classificationSettings,
    frameCount: analysis.frameCount,
    spans,
    reviewBoundaries,
  };
}

function createSpan(exposureIndex: number, start: number, end: number): ExposureSpan {
  return {
    id: `exposure-${exposureIndex.toString().padStart(8, "0")}`,
    exposureIndex,
    displayCelNumber: exposureIndex + 1,
    startTimelinePosition: start,
    endTimelinePosition: end,
    frameCount: end - start + 1,
    representativeTimelinePosition: start,
  };
}

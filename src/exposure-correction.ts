import type { ExposureSpan, ExposureTimeline } from "./exposure-span.js";

export type ExposureCorrectionAction =
  | { readonly type: "split"; readonly timelinePosition: number }
  | { readonly type: "merge-previous"; readonly timelinePosition: number }
  | { readonly type: "merge-next"; readonly timelinePosition: number }
  | { readonly type: "select-representative"; readonly timelinePosition: number }
  | { readonly type: "confirm-same"; readonly timelinePosition: number }
  | { readonly type: "confirm-changed"; readonly timelinePosition: number };

export interface ExposureCorrectionState {
  readonly canSplit: boolean;
  readonly canMergePrevious: boolean;
  readonly canMergeNext: boolean;
  readonly representativeFrameNumber: number;
  readonly selectedFrameIsRepresentative: boolean;
  readonly boundaryBeforeNeedsReview: boolean;
}

export function correctionStateForFrame(
  timeline: ExposureTimeline,
  timelinePosition: number,
): ExposureCorrectionState {
  const spanIndex = findSpanIndex(timeline, timelinePosition);
  const span = timeline.spans[spanIndex]!;
  return {
    canSplit: timelinePosition > span.startTimelinePosition,
    canMergePrevious: spanIndex > 0,
    canMergeNext: spanIndex < timeline.spans.length - 1,
    representativeFrameNumber: span.representativeTimelinePosition + 1,
    selectedFrameIsRepresentative: span.representativeTimelinePosition === timelinePosition,
    boundaryBeforeNeedsReview: timeline.reviewBoundaries.some(
      (boundary) => boundary.toTimelinePosition === timelinePosition,
    ),
  };
}

export function applyExposureCorrection(
  timeline: ExposureTimeline,
  action: ExposureCorrectionAction,
): ExposureTimeline {
  const spanIndex = findSpanIndex(timeline, action.timelinePosition);
  if (action.type === "select-representative") {
    const spans = timeline.spans.map((span, index) => index === spanIndex
      ? { ...span, representativeTimelinePosition: action.timelinePosition }
      : span);
    return { ...timeline, spans };
  }

  if (action.type === "confirm-same" || action.type === "confirm-changed") {
    const boundaryExists = timeline.reviewBoundaries.some(
      (boundary) => boundary.toTimelinePosition === action.timelinePosition,
    );
    if (!boundaryExists) throw new Error("The selected frame has no uncertain boundary before it");
    const withoutReview = removeReviewBoundary(timeline, action.timelinePosition);
    const boundaryIsSplit = withoutReview.spans[spanIndex]!.startTimelinePosition === action.timelinePosition;
    if (action.type === "confirm-same") {
      return boundaryIsSplit
        ? mergeAtIndex(withoutReview, spanIndex - 1)
        : withoutReview;
    }
    return boundaryIsSplit
      ? withoutReview
      : splitAtPosition(withoutReview, action.timelinePosition);
  }

  if (action.type === "split") return splitAtPosition(timeline, action.timelinePosition);

  if (action.type !== "merge-previous" && action.type !== "merge-next") {
    throw new Error("Unknown exposure correction action");
  }

  const leftIndex = action.type === "merge-previous" ? spanIndex - 1 : spanIndex;
  return mergeAtIndex(timeline, leftIndex);
}

function mergeAtIndex(timeline: ExposureTimeline, leftIndex: number): ExposureTimeline {
  if (leftIndex < 0 || leftIndex >= timeline.spans.length - 1) {
    throw new Error("Cannot merge exposures at the file boundary");
  }
  const left = timeline.spans[leftIndex]!;
  const right = timeline.spans[leftIndex + 1]!;
  const merged: ExposureSpan = {
    ...left,
    endTimelinePosition: right.endTimelinePosition,
    frameCount: right.endTimelinePosition - left.startTimelinePosition + 1,
  };
  const spans = reindexSpans([
    ...timeline.spans.slice(0, leftIndex),
    merged,
    ...timeline.spans.slice(leftIndex + 2),
  ]);
  return {
    ...timeline,
    spans,
    reviewBoundaries: timeline.reviewBoundaries.filter(
      (boundary) => boundary.toTimelinePosition !== right.startTimelinePosition,
    ),
  };
}

function splitAtPosition(timeline: ExposureTimeline, timelinePosition: number): ExposureTimeline {
  const spanIndex = findSpanIndex(timeline, timelinePosition);
  const span = timeline.spans[spanIndex]!;
  if (timelinePosition === span.startTimelinePosition) {
    throw new Error("Cannot split at the first frame of an exposure");
  }
  const leftEnd = timelinePosition - 1;
  const left: ExposureSpan = {
    ...span,
    endTimelinePosition: leftEnd,
    frameCount: leftEnd - span.startTimelinePosition + 1,
    representativeTimelinePosition: Math.min(span.representativeTimelinePosition, leftEnd),
  };
  const right: ExposureSpan = {
    ...span,
    id: `${span.id}-split-${timelinePosition}`,
    startTimelinePosition: timelinePosition,
    frameCount: span.endTimelinePosition - timelinePosition + 1,
    representativeTimelinePosition: Math.max(span.representativeTimelinePosition, timelinePosition),
  };
  const spans = reindexSpans([
    ...timeline.spans.slice(0, spanIndex),
    left,
    right,
    ...timeline.spans.slice(spanIndex + 1),
  ]);
  return {
    ...timeline,
    spans,
    reviewBoundaries: timeline.reviewBoundaries.filter(
      (boundary) => boundary.toTimelinePosition !== timelinePosition,
    ),
  };
}

function removeReviewBoundary(timeline: ExposureTimeline, timelinePosition: number): ExposureTimeline {
  return {
    ...timeline,
    reviewBoundaries: timeline.reviewBoundaries.filter(
      (boundary) => boundary.toTimelinePosition !== timelinePosition,
    ),
  };
}

function findSpanIndex(timeline: ExposureTimeline, timelinePosition: number): number {
  if (!Number.isSafeInteger(timelinePosition) || timelinePosition < 0 || timelinePosition >= timeline.frameCount) {
    throw new Error("Exposure correction requires a valid timeline position");
  }
  const spanIndex = timeline.spans.findIndex(
    (span) => timelinePosition >= span.startTimelinePosition && timelinePosition <= span.endTimelinePosition,
  );
  if (spanIndex < 0) throw new Error(`No exposure contains timeline position ${timelinePosition}`);
  return spanIndex;
}

function reindexSpans(spans: readonly ExposureSpan[]): ExposureSpan[] {
  return spans.map((span, exposureIndex) => ({
    ...span,
    exposureIndex,
    displayCelNumber: exposureIndex + 1,
  }));
}

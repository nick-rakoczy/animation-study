export interface InclusiveTimelineRange {
  readonly startPosition: number;
  readonly endPosition: number;
  readonly frameCount: number;
}

export interface TimelineRangeFractions {
  readonly left: number;
  readonly width: number;
}

export function createInclusiveTimelineRange(
  anchorPosition: number,
  focusPosition: number,
  frameCount: number,
): InclusiveTimelineRange {
  assertPosition(anchorPosition, frameCount);
  assertPosition(focusPosition, frameCount);
  const startPosition = Math.min(anchorPosition, focusPosition);
  const endPosition = Math.max(anchorPosition, focusPosition);
  return {
    startPosition,
    endPosition,
    frameCount: endPosition - startPosition + 1,
  };
}

export function timelineRangeFractions(
  range: InclusiveTimelineRange,
  frameCount: number,
): TimelineRangeFractions {
  assertPosition(range.startPosition, frameCount);
  assertPosition(range.endPosition, frameCount);
  if (range.startPosition > range.endPosition || range.frameCount !== range.endPosition - range.startPosition + 1) {
    throw new Error("Timeline range is inconsistent");
  }
  return {
    left: range.startPosition / frameCount,
    width: range.frameCount / frameCount,
  };
}

function assertPosition(position: number, frameCount: number): void {
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
    throw new Error("Frame count must be a positive integer");
  }
  if (!Number.isSafeInteger(position) || position < 0 || position >= frameCount) {
    throw new Error(`Timeline position ${position} is outside the source`);
  }
}

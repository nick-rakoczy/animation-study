import type { CelInformation } from "./app-contract.js";
import type { ExposureTimeline } from "./exposure-span.js";
import { parseRational, type Rational } from "./rational.js";
import type { NormalizedTiming } from "./timing.js";

export function celInformationForFrame(
  timing: NormalizedTiming,
  timeline: ExposureTimeline,
  timelinePosition: number,
): CelInformation {
  if (timing.frameCount !== timeline.frameCount) {
    throw new Error("Source timing and exposure analysis must have the same frame count");
  }
  if (!Number.isSafeInteger(timelinePosition) || timelinePosition < 0 || timelinePosition >= timing.frameCount) {
    throw new Error("Cel information requires a valid timeline position");
  }
  const span = timeline.spans.find(
    (candidate) =>
      timelinePosition >= candidate.startTimelinePosition &&
      timelinePosition <= candidate.endTimelinePosition,
  );
  if (!span) throw new Error(`No exposure contains timeline position ${timelinePosition}`);

  let elapsedDuration: Rational = { numerator: "0", denominator: "1" };
  for (let position = span.startTimelinePosition; position <= span.endTimelinePosition; position += 1) {
    elapsedDuration = addRationals(
      elapsedDuration,
      timing.frames[position]!.presentationDuration,
    );
  }
  return {
    status: "ready",
    displayCelNumber: span.displayCelNumber,
    exposureStartFrameNumber: span.startTimelinePosition + 1,
    holdLengthFrames: span.frameCount,
    cadenceLabel: cadenceLabel(span.frameCount),
    elapsedDuration,
  };
}

export function adjacentCelStartPosition(
  timeline: ExposureTimeline,
  timelinePosition: number,
  direction: "previous" | "next",
): number | null {
  if (direction !== "previous" && direction !== "next") {
    throw new Error("Cel navigation direction must be previous or next");
  }
  if (!Number.isSafeInteger(timelinePosition) || timelinePosition < 0 || timelinePosition >= timeline.frameCount) {
    throw new Error("Cel navigation requires a valid timeline position");
  }
  const currentIndex = timeline.spans.findIndex(
    (span) => timelinePosition >= span.startTimelinePosition && timelinePosition <= span.endTimelinePosition,
  );
  if (currentIndex < 0) throw new Error(`No exposure contains timeline position ${timelinePosition}`);
  const adjacentIndex = currentIndex + (direction === "previous" ? -1 : 1);
  return timeline.spans[adjacentIndex]?.startTimelinePosition ?? null;
}

export function cadenceLabel(frameCount: number): string {
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
    throw new Error("Cadence requires a positive frame count");
  }
  if (frameCount === 1) return "On ones";
  if (frameCount === 2) return "On twos";
  if (frameCount === 3) return "On threes";
  return `On ${frameCount}s`;
}

function addRationals(left: Rational, right: Rational): Rational {
  const numerator =
    BigInt(left.numerator) * BigInt(right.denominator) +
    BigInt(right.numerator) * BigInt(left.denominator);
  const denominator = BigInt(left.denominator) * BigInt(right.denominator);
  return parseRational(`${numerator}/${denominator}`, "exposure duration");
}

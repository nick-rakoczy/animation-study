export const timelineSampleCounts = [6, 12, 24, 48, 96] as const;
export const defaultTimelineScaleIndex = 1;

export function nextTimelineScaleIndex(
  currentIndex: number,
  direction: -1 | 1,
  frameCount: number,
): number {
  if (!Number.isSafeInteger(currentIndex) || !timelineSampleCounts[currentIndex]) {
    throw new Error("Timeline scale index is outside the available levels");
  }
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
    throw new Error("Frame count must be a positive integer");
  }

  const currentCount = Math.min(frameCount, timelineSampleCounts[currentIndex]);
  for (
    let candidate = currentIndex + direction;
    candidate >= 0 && candidate < timelineSampleCounts.length;
    candidate += direction
  ) {
    if (Math.min(frameCount, timelineSampleCounts[candidate]!) !== currentCount) return candidate;
  }
  return currentIndex;
}

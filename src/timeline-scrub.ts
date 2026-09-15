export function timelinePositionFromOffset(
  offset: number,
  width: number,
  frameCount: number,
): number {
  if (!Number.isFinite(offset)) throw new Error("Timeline offset must be finite");
  if (!Number.isFinite(width) || width <= 0) throw new Error("Timeline width must be positive");
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
    throw new Error("Frame count must be a positive integer");
  }
  if (frameCount === 1) return 0;
  const fraction = Math.max(0, Math.min(1, offset / width));
  return Math.round(fraction * (frameCount - 1));
}

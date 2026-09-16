export function scrollAdjustmentToReveal(
  viewportStart: number,
  viewportEnd: number,
  itemStart: number,
  itemEnd: number,
  margin: number,
): number {
  const safeMargin = Math.max(0, Math.min(margin, (viewportEnd - viewportStart) / 2));
  const visibleStart = viewportStart + safeMargin;
  const visibleEnd = viewportEnd - safeMargin;

  if (itemStart < visibleStart) return itemStart - visibleStart;
  if (itemEnd > visibleEnd) return itemEnd - visibleEnd;
  return 0;
}

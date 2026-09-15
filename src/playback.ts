import { subtractRationals } from "./rational.js";
import type { PlaybackFrame } from "./app-contract.js";
import type { NormalizedTiming } from "./timing.js";

export function createPlaybackFrames(timing: NormalizedTiming): readonly PlaybackFrame[] {
  return timing.frames.map((frame) => ({
    timelinePosition: frame.timelinePosition,
    displayFrameNumber: frame.displayFrameNumber,
    presentationTimestamp: frame.presentationTimestamp,
    presentationDuration: frame.presentationDuration,
    playbackTimestamp: subtractRationals(
      frame.presentationTimestamp,
      timing.firstPresentationTimestamp,
    ),
  }));
}

export function timelinePositionAtPlaybackTime(
  frames: readonly PlaybackFrame[],
  playbackTimeSeconds: number,
): number {
  if (frames.length === 0) throw new Error("Playback timing has no frames");
  if (!Number.isFinite(playbackTimeSeconds)) {
    throw new Error("Playback time must be finite");
  }

  let low = 0;
  let high = frames.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const start = rationalToNumber(frames[middle]!.playbackTimestamp);
    if (start <= playbackTimeSeconds) low = middle + 1;
    else high = middle;
  }
  return frames[Math.max(0, low - 1)]!.timelinePosition;
}

export function playbackSeekTime(frame: PlaybackFrame): number {
  const start = rationalToNumber(frame.playbackTimestamp);
  const duration = rationalToNumber(frame.presentationDuration);
  return start + duration / 2;
}

function rationalToNumber(value: { readonly numerator: string; readonly denominator: string }): number {
  return Number(value.numerator) / Number(value.denominator);
}

import {
  compareRationals,
  invertRational,
  parseRational,
  rationalFromTicks,
  subtractRationals,
  type Rational,
} from "./rational.js";

export interface RawProbe {
  readonly streams?: readonly RawStream[];
  readonly frames?: readonly RawFrame[];
  readonly format?: RawFormat;
}

interface RawStream {
  readonly index?: number;
  readonly codec_name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly pix_fmt?: string;
  readonly sample_aspect_ratio?: string;
  readonly display_aspect_ratio?: string;
  readonly avg_frame_rate?: string;
  readonly r_frame_rate?: string;
  readonly time_base?: string;
  readonly duration_ts?: number | string;
  readonly duration?: string;
  readonly nb_frames?: string;
  readonly tags?: { readonly rotate?: string };
  readonly side_data_list?: readonly { readonly rotation?: number }[];
}

interface RawFrame {
  readonly best_effort_timestamp?: number | string;
  readonly duration?: number | string;
  readonly pkt_duration?: number | string;
  readonly pkt_dts?: number | string;
  readonly key_frame?: number;
  readonly pict_type?: string;
}

interface RawFormat {
  readonly format_name?: string;
  readonly duration?: string;
}

export interface SourceFrameTiming {
  readonly id: string;
  readonly timelinePosition: number;
  readonly displayFrameNumber: number;
  readonly decodedFrameIndex: number;
  readonly presentationTimestamp: Rational;
  readonly presentationDuration: Rational;
  readonly presentationTimestampTicks: string;
  readonly presentationDurationTicks: string | null;
  readonly keyFrame: boolean;
  readonly pictureType: string | null;
  readonly durationSource: "packet" | "next-timestamp" | "nominal-rate" | "previous-frame";
}

export interface NormalizedTiming {
  readonly schemaVersion: 1;
  readonly stream: {
    readonly index: number;
    readonly codec: string | null;
    readonly width: number;
    readonly height: number;
    readonly pixelFormat: string | null;
    readonly sampleAspectRatio: string | null;
    readonly displayAspectRatio: string | null;
    readonly averageFrameRate: Rational | null;
    readonly realFrameRate: Rational | null;
    readonly timeBase: Rational;
    readonly rotationDegrees: number;
  };
  readonly container: {
    readonly formatName: string | null;
    readonly reportedDurationSeconds: string | null;
  };
  readonly frameCount: number;
  readonly firstPresentationTimestamp: Rational;
  readonly presentationSpan: Rational;
  readonly frames: readonly SourceFrameTiming[];
}

export function normalizeTiming(raw: RawProbe): NormalizedTiming {
  const stream = raw.streams?.[0];
  if (!stream) throw new Error("ffprobe did not return a video stream");
  if (!stream.time_base) throw new Error("The video stream has no time base");
  if (!stream.width || !stream.height) throw new Error("The video stream has invalid dimensions");

  const timeBase = parseRational(stream.time_base, "stream.time_base");
  const rawFrames = raw.frames ?? [];
  if (rawFrames.length === 0) throw new Error("ffprobe did not return any decoded video frames");

  const ordered = rawFrames.map((frame, decodedFrameIndex) => {
    if (frame.best_effort_timestamp === undefined) {
      throw new Error(`Frame ${decodedFrameIndex} has no presentation timestamp`);
    }
    const timestampTicks = BigInt(frame.best_effort_timestamp);
    return {
      raw: frame,
      decodedFrameIndex,
      timestampTicks,
      timestamp: rationalFromTicks(timestampTicks, timeBase),
    };
  });

  ordered.sort((left, right) => {
    const byTimestamp = compareRationals(left.timestamp, right.timestamp);
    return byTimestamp || left.decodedFrameIndex - right.decodedFrameIndex;
  });

  const averageFrameRate = parseOptionalRate(stream.avg_frame_rate, "stream.avg_frame_rate");
  const nominalDuration = averageFrameRate ? invertRational(averageFrameRate) : null;
  const frames: SourceFrameTiming[] = [];

  for (let timelinePosition = 0; timelinePosition < ordered.length; timelinePosition += 1) {
    const current = ordered[timelinePosition]!;
    const next = ordered[timelinePosition + 1];
    // FFmpeg 9 reports this as `duration`; older releases used `pkt_duration`.
    const packetDurationTicks = parsePositiveTicks(current.raw.duration ?? current.raw.pkt_duration);
    let presentationDuration: Rational;
    let durationSource: SourceFrameTiming["durationSource"];

    if (packetDurationTicks !== null) {
      presentationDuration = rationalFromTicks(packetDurationTicks, timeBase);
      durationSource = "packet";
    } else if (next && compareRationals(next.timestamp, current.timestamp) > 0) {
      presentationDuration = subtractRationals(next.timestamp, current.timestamp);
      durationSource = "next-timestamp";
    } else if (nominalDuration) {
      presentationDuration = nominalDuration;
      durationSource = "nominal-rate";
    } else if (frames.length > 0) {
      presentationDuration = frames[frames.length - 1]!.presentationDuration;
      durationSource = "previous-frame";
    } else {
      throw new Error("Cannot determine the duration of the only decoded frame");
    }

    frames.push({
      id: `frame-${timelinePosition.toString().padStart(8, "0")}`,
      timelinePosition,
      displayFrameNumber: timelinePosition + 1,
      decodedFrameIndex: current.decodedFrameIndex,
      presentationTimestamp: current.timestamp,
      presentationDuration,
      presentationTimestampTicks: current.timestampTicks.toString(),
      presentationDurationTicks: packetDurationTicks?.toString() ?? null,
      keyFrame: current.raw.key_frame === 1,
      pictureType: current.raw.pict_type ?? null,
      durationSource,
    });
  }

  const firstTimestamp = frames[0]!.presentationTimestamp;
  const lastFrame = frames[frames.length - 1]!;
  const presentationEnd = addRationals(lastFrame.presentationTimestamp, lastFrame.presentationDuration);

  return {
    schemaVersion: 1,
    stream: {
      index: stream.index ?? 0,
      codec: stream.codec_name ?? null,
      width: stream.width,
      height: stream.height,
      pixelFormat: stream.pix_fmt ?? null,
      sampleAspectRatio: stream.sample_aspect_ratio ?? null,
      displayAspectRatio: stream.display_aspect_ratio ?? null,
      averageFrameRate,
      realFrameRate: parseOptionalRate(stream.r_frame_rate, "stream.r_frame_rate"),
      timeBase,
      rotationDegrees: stream.side_data_list?.find((item) => item.rotation !== undefined)?.rotation ?? Number(stream.tags?.rotate ?? 0),
    },
    container: {
      formatName: raw.format?.format_name ?? null,
      reportedDurationSeconds: raw.format?.duration ?? null,
    },
    frameCount: frames.length,
    firstPresentationTimestamp: firstTimestamp,
    presentationSpan: subtractRationals(presentationEnd, firstTimestamp),
    frames,
  };
}

function parseOptionalRate(value: string | undefined, field: string): Rational | null {
  if (!value || value === "0/0") return null;
  const parsed = parseRational(value, field);
  return BigInt(parsed.numerator) > 0n ? parsed : null;
}

function parsePositiveTicks(value: number | string | undefined): bigint | null {
  if (value === undefined) return null;
  const ticks = BigInt(value);
  return ticks > 0n ? ticks : null;
}

function addRationals(left: Rational, right: Rational): Rational {
  const numerator =
    BigInt(left.numerator) * BigInt(right.denominator) +
    BigInt(right.numerator) * BigInt(left.denominator);
  const denominator = BigInt(left.denominator) * BigInt(right.denominator);
  return parseRational(`${numerator}/${denominator}`, "sum");
}

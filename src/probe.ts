import { runProcess } from "./process.js";
import { normalizeTiming, type NormalizedTiming, type RawProbe } from "./timing.js";

const SHOW_ENTRIES = [
  "stream=index,codec_name,width,height,pix_fmt,sample_aspect_ratio,display_aspect_ratio,avg_frame_rate,r_frame_rate,time_base,duration_ts,duration,nb_frames",
  "stream_tags=rotate",
  "stream_side_data=rotation",
  "frame=best_effort_timestamp,duration,pkt_duration,pkt_dts,key_frame,pict_type",
  "format=format_name,duration",
].join(":");

export async function probeVideo(
  inputPath: string,
  ffprobeExecutable = "ffprobe",
  signal?: AbortSignal,
): Promise<NormalizedTiming> {
  const result = await runProcess(
    ffprobeExecutable,
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", SHOW_ENTRIES,
      "-show_streams",
      "-show_frames",
      "-show_format",
      "-of", "json",
      inputPath,
    ],
    signal,
  );

  let raw: RawProbe;
  try {
    raw = JSON.parse(result.stdout) as RawProbe;
  } catch (error) {
    throw new Error("ffprobe returned invalid JSON", { cause: error });
  }
  return normalizeTiming(raw);
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { DisplayFrame, MediaToolStatus, OpenVideoResult } from "../../src/app-contract.js";
import { timelinePositionAtPlaybackTime } from "../../src/playback.js";

export function App() {
  const [tools, setTools] = useState<MediaToolStatus | null>(null);
  const [video, setVideo] = useState<OpenVideoResult | null>(null);
  const [frame, setFrame] = useState<DisplayFrame | null>(null);
  const [timelinePosition, setTimelinePosition] = useState(0);
  const [showingPlayback, setShowingPlayback] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoElement = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    void window.animationStudy.getMediaToolStatus().then(setTools);
  }, []);

  const openVideo = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const opened = await window.animationStudy.openVideo();
      if (opened) {
        setVideo(opened);
        setFrame(opened.frame);
        setTimelinePosition(opened.frame.timelinePosition);
        setShowingPlayback(false);
        setPlaying(false);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const showFrame = useCallback(async (position: number) => {
    if (!video || busy) return;
    videoElement.current?.pause();
    setShowingPlayback(false);
    const clamped = Math.max(0, Math.min(video.playbackFrames.length - 1, position));
    if (clamped === frame?.timelinePosition) {
      setTimelinePosition(clamped);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const requested = await window.animationStudy.getFrame(clamped);
      setFrame(requested);
      setTimelinePosition(requested.timelinePosition);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [busy, frame, video]);

  const togglePlayback = useCallback(async () => {
    const element = videoElement.current;
    const playbackPosition = element?.ended ? 0 : timelinePosition;
    const playbackFrame = video?.playbackFrames[playbackPosition];
    if (!element || !playbackFrame || busy) return;
    if (!element.paused) {
      element.pause();
      return;
    }

    setError(null);
    try {
      await waitForMetadata(element);
      element.currentTime = rationalSeconds(playbackFrame.playbackTimestamp);
      setTimelinePosition(playbackPosition);
      setShowingPlayback(true);
      await element.play();
    } catch (caught) {
      setShowingPlayback(false);
      setError(errorMessage(caught));
    }
  }, [busy, timelinePosition, video]);

  useEffect(() => {
    const element = videoElement.current;
    if (!element || !video || !playing) return;
    let callbackId = 0;
    const updatePosition: VideoFrameRequestCallback = (_now, metadata) => {
      setTimelinePosition(timelinePositionAtPlaybackTime(video.playbackFrames, metadata.mediaTime));
      callbackId = element.requestVideoFrameCallback(updatePosition);
    };
    callbackId = element.requestVideoFrameCallback(updatePosition);
    return () => element.cancelVideoFrameCallback(callbackId);
  }, [playing, video]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!video) return;
      if (event.key === " " && !isInteractiveTarget(event.target)) {
        event.preventDefault();
        void togglePlayback();
        return;
      }
      const previous = event.key === "ArrowLeft" || event.key === ",";
      const next = event.key === "ArrowRight" || event.key === ".";
      if (previous || next || event.key === "Home" || event.key === "End") event.preventDefault();
      if (previous) void showFrame(timelinePosition - 1);
      else if (next) void showFrame(timelinePosition + 1);
      else if (event.key === "Home") void showFrame(0);
      else if (event.key === "End") void showFrame(video.playbackFrames.length - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showFrame, timelinePosition, togglePlayback, video]);

  const toolDescription = tools?.available
    ? compactVersion(tools.ffmpegVersion)
    : tools?.error ?? "Checking FFmpeg";
  const selectedTiming = video?.playbackFrames[timelinePosition];

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>Animation Study</h1>
          <p className={tools?.available ? "tool-status" : "tool-status tool-error"}>{toolDescription}</p>
        </div>
        <button className="open-button" disabled={busy || tools?.available !== true} onClick={() => void openVideo()}>
          {busy && !video ? "Opening..." : "Open video"}
        </button>
      </header>

      <section className="workspace">
        <div className="viewer" aria-busy={busy}>
          {video ? (
            <>
              <video
                ref={videoElement}
                className={showingPlayback ? "source-video" : "source-video hidden"}
                src={video.playbackUrl}
                preload="auto"
                playsInline
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                  setPlaying(false);
                  setTimelinePosition(video.playbackFrames.length - 1);
                }}
                onError={() => setError("The source could not be played by the embedded media decoder")}
              />
              {!showingPlayback && frame ? <img src={frame.imageDataUrl} alt={`Source frame ${frame.displayFrameNumber}`} /> : null}
            </>
          ) : (
            <div className="empty-state">
              <span className="frame-mark">▧</span>
              <p>Open a video to inspect its frames.</p>
            </div>
          )}
          {busy && video ? <div className="loading-indicator">Loading frame</div> : null}
        </div>

        <aside className="information" aria-label="Frame information">
          <h2>Frame information</h2>
          <Info label="File" value={video?.sourceName} />
          <Info label="Timeline frame" value={selectedTiming ? `${selectedTiming.displayFrameNumber} of ${video?.playbackFrames.length}` : undefined} />
          <Info label="Source timestamp" value={selectedTiming ? formatRationalSeconds(selectedTiming.presentationTimestamp) : undefined} />
          <Info label="Frame duration" value={selectedTiming ? formatRationalSeconds(selectedTiming.presentationDuration) : undefined} />
          <Info label="Source size" value={video ? `${video.width} × ${video.height}` : undefined} />
          <Info label="Codec" value={video?.codec ?? undefined} />
          <Info label="Cel" value="Pending analysis" />
        </aside>
      </section>

      <footer className="transport">
        <button aria-label="First frame" disabled={!video || busy || timelinePosition === 0} onClick={() => void showFrame(0)}>│◀</button>
        <button aria-label="Previous frame" disabled={!video || busy || timelinePosition === 0} onClick={() => void showFrame(timelinePosition - 1)}>◀</button>
        <button className="play-button" aria-label={playing ? "Pause" : "Play"} disabled={!video || busy} onClick={() => void togglePlayback()}>{playing ? "❚❚" : "▶"}</button>
        <div className="frame-readout">{selectedTiming ? selectedTiming.displayFrameNumber.toString().padStart(6, "0") : "------"}</div>
        <button aria-label="Next frame" disabled={!video || busy || timelinePosition === video.playbackFrames.length - 1} onClick={() => void showFrame(timelinePosition + 1)}>▶</button>
        <button aria-label="Last frame" disabled={!video || busy || timelinePosition === video.playbackFrames.length - 1} onClick={() => video && void showFrame(video.playbackFrames.length - 1)}>▶│</button>
      </footer>

      {error ? <div className="error-banner" role="alert">{error}</div> : null}
    </main>
  );
}

function Info({ label, value }: { readonly label: string; readonly value: string | undefined }) {
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

function compactVersion(version: string | null): string {
  const match = version?.match(/ffmpeg version\s+(\S+)/i);
  return match?.[1] ? `FFmpeg ${match[1]}` : "FFmpeg available";
}

function formatRationalSeconds(value: { readonly numerator: string; readonly denominator: string }): string {
  return `${(Number(value.numerator) / Number(value.denominator)).toFixed(6)} s`;
}

function rationalSeconds(value: { readonly numerator: string; readonly denominator: string }): number {
  return Number(value.numerator) / Number(value.denominator);
}

function waitForMetadata(element: HTMLVideoElement): Promise<void> {
  if (element.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    element.addEventListener("loadedmetadata", () => resolve(), { once: true });
    element.addEventListener("error", () => reject(new Error("The source media metadata could not be loaded")), { once: true });
  });
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(target.tagName));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

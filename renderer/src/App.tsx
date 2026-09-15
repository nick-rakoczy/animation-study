import { useCallback, useEffect, useRef, useState } from "react";
import type { CelInformation, DisplayFrame, MediaToolStatus, OpenVideoResult, TimelineThumbnail } from "../../src/app-contract.js";
import { timelinePositionAtPlaybackTime } from "../../src/playback.js";
import { timelinePositionFromOffset } from "../../src/timeline-scrub.js";

export function App() {
  const [tools, setTools] = useState<MediaToolStatus | null>(null);
  const [video, setVideo] = useState<OpenVideoResult | null>(null);
  const [frame, setFrame] = useState<DisplayFrame | null>(null);
  const [timelinePosition, setTimelinePosition] = useState(0);
  const [celInformation, setCelInformation] = useState<CelInformation | null>(null);
  const [timelineThumbnails, setTimelineThumbnails] = useState<readonly TimelineThumbnail[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [showingPlayback, setShowingPlayback] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoElement = useRef<HTMLVideoElement>(null);
  const displayedFramePosition = useRef(0);
  const requestedFramePosition = useRef<number | null>(null);
  const frameRequestRunning = useRef(false);

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
        displayedFramePosition.current = opened.frame.timelinePosition;
        requestedFramePosition.current = null;
        setTimelinePosition(opened.frame.timelinePosition);
        setCelInformation({ status: "pending" });
        setTimelineThumbnails([]);
        setShowingPlayback(false);
        setPlaying(false);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!video) return;
    let cancelled = false;
    setTimelineLoading(true);
    void window.animationStudy.getTimelineThumbnails(12).then(
      (thumbnails) => {
        if (!cancelled) setTimelineThumbnails(thumbnails);
      },
      (caught) => {
        if (!cancelled) setError(errorMessage(caught));
      },
    ).finally(() => {
      if (!cancelled) setTimelineLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [video]);

  const showFrame = useCallback((position: number) => {
    if (!video) return;
    videoElement.current?.pause();
    setShowingPlayback(false);
    const clamped = Math.max(0, Math.min(video.playbackFrames.length - 1, position));
    requestedFramePosition.current = clamped;
    setTimelinePosition(clamped);
    if (frameRequestRunning.current) return;

    frameRequestRunning.current = true;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        while (requestedFramePosition.current !== null) {
          const requestedPosition = requestedFramePosition.current;
          requestedFramePosition.current = null;
          if (requestedPosition === displayedFramePosition.current) continue;
          const requested = await window.animationStudy.getFrame(requestedPosition);
          if (requestedFramePosition.current === null) {
            setFrame(requested);
            displayedFramePosition.current = requested.timelinePosition;
            setTimelinePosition(requested.timelinePosition);
          }
        }
      } catch (caught) {
        requestedFramePosition.current = null;
        setError(errorMessage(caught));
      } finally {
        frameRequestRunning.current = false;
        setBusy(false);
      }
    })();
  }, [video]);

  const scrubTimeline = useCallback((clientX: number, element: HTMLDivElement) => {
    if (!video) return;
    const bounds = element.getBoundingClientRect();
    showFrame(timelinePositionFromOffset(clientX - bounds.left, bounds.width, video.playbackFrames.length));
  }, [showFrame, video]);

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
    if (!video) {
      setCelInformation(null);
      return;
    }
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const result = await window.animationStudy.getCelInformation(timelinePosition);
        if (cancelled) return;
        setCelInformation(result);
        if (result.status === "pending") retry = setTimeout(() => void refresh(), 200);
      } catch (caught) {
        if (!cancelled) setCelInformation({ status: "failed", error: errorMessage(caught) });
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [timelinePosition, video]);

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
  const pendingCelValue = video ? "Pending analysis" : undefined;
  const readyCel = celInformation?.status === "ready" ? celInformation : null;
  const unavailableCelValue = celInformation?.status === "failed" ? "Unavailable" : pendingCelValue;
  const playheadPercent = video && video.playbackFrames.length > 1
    ? (timelinePosition / (video.playbackFrames.length - 1)) * 100
    : 0;

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
          <Info
            label="Cel"
            value={readyCel ? readyCel.displayCelNumber.toString().padStart(4, "0") : unavailableCelValue}
            title={celInformation?.status === "failed" ? celInformation.error : undefined}
          />
          <Info label="Exposure start" value={readyCel ? `Frame ${readyCel.exposureStartFrameNumber}` : unavailableCelValue} />
          <Info label="Hold length" value={readyCel ? `${readyCel.holdLengthFrames} ${readyCel.holdLengthFrames === 1 ? "frame" : "frames"}` : unavailableCelValue} />
          <Info label="Cadence" value={readyCel?.cadenceLabel ?? unavailableCelValue} />
          <Info label="Elapsed duration" value={readyCel ? formatRationalSeconds(readyCel.elapsedDuration) : unavailableCelValue} />
        </aside>
      </section>

      <section className="timeline" aria-label="Timeline filmstrip" aria-busy={timelineLoading}>
        {video ? (
          timelineThumbnails.length > 0 ? (
            <div
              className="filmstrip"
              role="slider"
              aria-label="Timeline playhead"
              aria-valuemin={1}
              aria-valuemax={video.playbackFrames.length}
              aria-valuenow={timelinePosition + 1}
              tabIndex={0}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                scrubTimeline(event.clientX, event.currentTarget);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  scrubTimeline(event.clientX, event.currentTarget);
                }
              }}
              onPointerUp={(event) => {
                scrubTimeline(event.clientX, event.currentTarget);
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
            >
              {timelineThumbnails.map((thumbnail) => (
                <figure
                  className={thumbnail.timelinePosition === timelinePosition ? "timeline-thumbnail selected" : "timeline-thumbnail"}
                  key={thumbnail.timelinePosition}
                >
                  <img src={thumbnail.imageDataUrl} alt="" draggable={false} />
                  <figcaption>{thumbnail.displayFrameNumber}</figcaption>
                </figure>
              ))}
              <div className="timeline-playhead" style={{ left: `${playheadPercent}%` }} aria-hidden="true" />
            </div>
          ) : (
            <p className="timeline-message">{timelineLoading ? "Loading filmstrip" : "Filmstrip unavailable"}</p>
          )
        ) : (
          <p className="timeline-message">Timeline</p>
        )}
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

function Info({ label, value, title }: {
  readonly label: string;
  readonly value: string | undefined;
  readonly title?: string | undefined;
}) {
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd title={title}>{value ?? "—"}</dd>
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

import { useCallback, useEffect, useState } from "react";
import type { DisplayFrame, MediaToolStatus, OpenVideoResult } from "../../src/app-contract.js";

export function App() {
  const [tools, setTools] = useState<MediaToolStatus | null>(null);
  const [video, setVideo] = useState<OpenVideoResult | null>(null);
  const [frame, setFrame] = useState<DisplayFrame | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const showFrame = useCallback(async (position: number) => {
    if (!frame || busy) return;
    const clamped = Math.max(0, Math.min(frame.frameCount - 1, position));
    if (clamped === frame.timelinePosition) return;
    setBusy(true);
    setError(null);
    try {
      setFrame(await window.animationStudy.getFrame(clamped));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [busy, frame]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!frame) return;
      const previous = event.key === "ArrowLeft" || event.key === ",";
      const next = event.key === "ArrowRight" || event.key === ".";
      if (previous || next || event.key === "Home" || event.key === "End") event.preventDefault();
      if (previous) void showFrame(frame.timelinePosition - 1);
      else if (next) void showFrame(frame.timelinePosition + 1);
      else if (event.key === "Home") void showFrame(0);
      else if (event.key === "End") void showFrame(frame.frameCount - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [frame, showFrame]);

  const toolDescription = tools?.available
    ? compactVersion(tools.ffmpegVersion)
    : tools?.error ?? "Checking FFmpeg";

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
          {frame ? <img src={frame.imageDataUrl} alt={`Source frame ${frame.displayFrameNumber}`} /> : (
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
          <Info label="Timeline frame" value={frame ? `${frame.displayFrameNumber} of ${frame.frameCount}` : undefined} />
          <Info label="Source timestamp" value={frame ? formatRationalSeconds(frame.presentationTimestamp) : undefined} />
          <Info label="Frame duration" value={frame ? formatRationalSeconds(frame.presentationDuration) : undefined} />
          <Info label="Source size" value={video ? `${video.width} × ${video.height}` : undefined} />
          <Info label="Codec" value={video?.codec ?? undefined} />
          <Info label="Cel" value="Pending analysis" />
        </aside>
      </section>

      <footer className="transport">
        <button aria-label="First frame" disabled={!frame || busy || frame.timelinePosition === 0} onClick={() => void showFrame(0)}>│◀</button>
        <button aria-label="Previous frame" disabled={!frame || busy || frame.timelinePosition === 0} onClick={() => frame && void showFrame(frame.timelinePosition - 1)}>◀</button>
        <div className="frame-readout">{frame ? frame.displayFrameNumber.toString().padStart(6, "0") : "------"}</div>
        <button aria-label="Next frame" disabled={!frame || busy || frame.timelinePosition === frame.frameCount - 1} onClick={() => frame && void showFrame(frame.timelinePosition + 1)}>▶</button>
        <button aria-label="Last frame" disabled={!frame || busy || frame.timelinePosition === frame.frameCount - 1} onClick={() => frame && void showFrame(frame.frameCount - 1)}>▶│</button>
      </footer>

      {error ? <div className="error-banner" role="alert">{error}</div> : null}
    </main>
  );
}

function Info({ label, value }: { readonly label: string; readonly value?: string }) {
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

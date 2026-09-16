import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BackgroundAnalysisStatus, CelInformation, CorrectionInformation, MediaToolStatus, OpenVideoResult, TimelineThumbnail } from "../../src/app-contract.js";
import type { AnalysisJobStage } from "../../src/analysis-job.js";
import type { ExposureCorrectionAction } from "../../src/exposure-correction.js";
import { appKeyboardAction } from "../../src/keyboard-shortcuts.js";
import { playbackSeekTime, timelinePositionAtPlaybackTime } from "../../src/playback.js";
import { createInclusiveTimelineRange, timelineRangeFractions, type InclusiveTimelineRange } from "../../src/timeline-range.js";
import { defaultTimelineScaleIndex, nextTimelineScaleIndex, timelineSampleCounts } from "../../src/timeline-scale.js";
import { scrollAdjustmentToReveal } from "../../src/timeline-scroll.js";
import { timelinePositionFromOffset } from "../../src/timeline-scrub.js";

export function App() {
  const [tools, setTools] = useState<MediaToolStatus | null>(null);
  const [video, setVideo] = useState<OpenVideoResult | null>(null);
  const [timelinePosition, setTimelinePosition] = useState(0);
  const [celInformation, setCelInformation] = useState<CelInformation | null>(null);
  const [correctionInformation, setCorrectionInformation] = useState<CorrectionInformation | null>(null);
  const [correctionRevision, setCorrectionRevision] = useState(0);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<BackgroundAnalysisStatus | null>(null);
  const [timelineThumbnails, setTimelineThumbnails] = useState<readonly TimelineThumbnail[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineScaleIndex, setTimelineScaleIndex] = useState(defaultTimelineScaleIndex);
  const [timelineRange, setTimelineRange] = useState<InclusiveTimelineRange | null>(null);
  const [rangeSelectionMode, setRangeSelectionMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoElement = useRef<HTMLVideoElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const timelineScroller = useRef<HTMLDivElement>(null);
  const filmstrip = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const focusTimelineWhenReady = useRef(false);
  const requestedTimelinePosition = useRef(0);
  const timelineRangeAnchor = useRef<number | null>(null);

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
        requestedTimelinePosition.current = 0;
        setTimelinePosition(0);
        setCelInformation({ status: "pending" });
        setCorrectionInformation({ status: "pending" });
        setAnalysisStatus({ status: "running", progress: null });
        setCorrectionRevision(0);
        setTimelineThumbnails([]);
        setTimelineScaleIndex(defaultTimelineScaleIndex);
        setTimelineRange(null);
        setExportStatus(null);
        setRangeSelectionMode(false);
        timelineRangeAnchor.current = null;
        setPlaying(false);
        focusTimelineWhenReady.current = true;
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const clearUnusedCache = useCallback(async () => {
    setCacheBusy(true);
    setCacheStatus(null);
    setError(null);
    try {
      const result = await window.animationStudy.clearUnusedCache();
      const noun = result.removedFileCount === 1 ? "file" : "files";
      setCacheStatus(`Removed ${result.removedFileCount} cached ${noun} (${formatBytes(result.removedBytes)})`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setCacheBusy(false);
    }
  }, []);

  const timelineSampleCount = timelineSampleCounts[timelineScaleIndex]!;

  useEffect(() => {
    if (!video) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setTimelineLoading(true);
    timer = setTimeout(() => {
      void window.animationStudy.getTimelineThumbnails(timelineSampleCount).then(
        (thumbnails) => {
          if (!cancelled) setTimelineThumbnails(thumbnails);
        },
        (caught) => {
          if (!cancelled) setError(errorMessage(caught));
        },
      ).finally(() => {
        if (!cancelled) setTimelineLoading(false);
      });
    }, 100);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [timelineSampleCount, video]);

  useEffect(() => {
    if (!focusTimelineWhenReady.current || timelineThumbnails.length === 0) return;
    focusTimelineWhenReady.current = false;
    const activeElement = document.activeElement;
    if (activeElement === document.body || activeElement === openButton.current) filmstrip.current?.focus();
  }, [timelineThumbnails]);

  const keepPlayheadInView = useCallback(() => {
    const scroller = timelineScroller.current;
    const marker = playhead.current;
    if (!scroller || !marker) return;

    const viewportBounds = scroller.getBoundingClientRect();
    const playheadBounds = marker.getBoundingClientRect();
    const adjustment = scrollAdjustmentToReveal(
      viewportBounds.left,
      viewportBounds.right,
      playheadBounds.left,
      playheadBounds.right,
      Math.min(48, scroller.clientWidth / 4),
    );
    if (adjustment !== 0) scroller.scrollLeft += adjustment;
  }, []);

  useLayoutEffect(() => {
    keepPlayheadInView();
  }, [keepPlayheadInView, timelinePosition, timelineThumbnails]);

  useEffect(() => {
    if (!video) {
      setAnalysisStatus(null);
      return;
    }
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const result = await window.animationStudy.getBackgroundAnalysisStatus();
        if (cancelled) return;
        setAnalysisStatus(result);
        if (result.status === "running") retry = setTimeout(() => void refresh(), 200);
      } catch (caught) {
        if (!cancelled) setAnalysisStatus({ status: "failed", error: errorMessage(caught) });
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [video]);

  const showFrame = useCallback((position: number) => {
    if (!video) return;
    const clamped = Math.max(0, Math.min(video.playbackFrames.length - 1, position));
    requestedTimelinePosition.current = clamped;
    setTimelinePosition(clamped);
    const element = videoElement.current;
    const playbackFrame = video.playbackFrames[clamped];
    if (!element || !playbackFrame) return;
    element.pause();
    void (async () => {
      try {
        await waitForMetadata(element);
        if (requestedTimelinePosition.current !== clamped) return;
        element.currentTime = playbackSeekTime(playbackFrame);
      } catch (caught) {
        setError(errorMessage(caught));
      }
    })();
  }, [video]);

  const stepFrame = useCallback((direction: -1 | 1) => {
    showFrame(requestedTimelinePosition.current + direction);
  }, [showFrame]);

  const timelinePositionForPointer = useCallback((clientX: number, element: HTMLDivElement) => {
    if (!video) return null;
    const bounds = element.getBoundingClientRect();
    return timelinePositionFromOffset(clientX - bounds.left, bounds.width, video.playbackFrames.length);
  }, [video]);

  const moveTimelinePointer = useCallback((clientX: number, element: HTMLDivElement) => {
    if (!video) return;
    const position = timelinePositionForPointer(clientX, element);
    if (position === null) return;
    if (timelineRangeAnchor.current !== null) {
      setTimelineRange(createInclusiveTimelineRange(
        timelineRangeAnchor.current,
        position,
        video.playbackFrames.length,
      ));
    }
    showFrame(position);
  }, [showFrame, timelinePositionForPointer, video]);

  const scaleTimeline = useCallback((direction: -1 | 1) => {
    if (!video) return;
    setTimelineScaleIndex((current) => nextTimelineScaleIndex(
      current,
      direction,
      video.playbackFrames.length,
    ));
  }, [video]);

  const navigateCel = useCallback(async (direction: "previous" | "next") => {
    if (!video) return;
    setError(null);
    try {
      const result = await window.animationStudy.getAdjacentCelPosition(timelinePosition, direction);
      if (result.status === "failed") {
        setError(result.error);
      } else if (result.status === "ready" && result.timelinePosition !== null) {
        showFrame(result.timelinePosition);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [showFrame, timelinePosition, video]);

  const togglePlayback = useCallback(async () => {
    const element = videoElement.current;
    const playbackPosition = element?.ended ? 0 : requestedTimelinePosition.current;
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
      requestedTimelinePosition.current = playbackPosition;
      setTimelinePosition(playbackPosition);
      keepPlayheadInView();
      await element.play();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [busy, keepPlayheadInView, video]);

  useEffect(() => {
    const element = videoElement.current;
    if (!element || !video || !playing) return;
    let callbackId = 0;
    const updatePosition: VideoFrameRequestCallback = (_now, metadata) => {
      const position = timelinePositionAtPlaybackTime(video.playbackFrames, metadata.mediaTime);
      requestedTimelinePosition.current = position;
      setTimelinePosition(position);
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
  }, [correctionRevision, timelinePosition, video]);

  useEffect(() => {
    if (!video) {
      setCorrectionInformation(null);
      return;
    }
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const result = await window.animationStudy.getCorrectionInformation(timelinePosition);
        if (cancelled) return;
        setCorrectionInformation(result);
        if (result.status === "pending") retry = setTimeout(() => void refresh(), 200);
      } catch (caught) {
        if (!cancelled) setCorrectionInformation({ status: "failed", error: errorMessage(caught) });
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [correctionRevision, timelinePosition, video]);

  const correctExposure = useCallback(async (type: ExposureCorrectionAction["type"]) => {
    if (!video || correctionBusy) return;
    setCorrectionBusy(true);
    setError(null);
    try {
      await window.animationStudy.applyExposureCorrection({ type, timelinePosition });
      setCorrectionRevision((revision) => revision + 1);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setCorrectionBusy(false);
    }
  }, [correctionBusy, timelinePosition, video]);

  const moveCorrectionHistory = useCallback(async (direction: "undo" | "redo") => {
    if (!video || correctionBusy) return;
    setCorrectionBusy(true);
    setError(null);
    try {
      if (direction === "undo") await window.animationStudy.undoExposureCorrection();
      else await window.animationStudy.redoExposureCorrection();
      setCorrectionRevision((revision) => revision + 1);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setCorrectionBusy(false);
    }
  }, [correctionBusy, video]);

  const exportSelection = useCallback(async () => {
    if (!timelineRange || exportBusy) return;
    setExportBusy(true);
    setExportStatus(null);
    setError(null);
    try {
      const result = await window.animationStudy.exportSelection(timelineRange);
      if (result) {
        setExportStatus(`Exported ${result.exportedFrameCount} ${result.exportedFrameCount === 1 ? "cel" : "cels"} to ${result.outputDirectory}`);
      }
    } catch (caught) {
      const message = errorMessage(caught);
      if (message.includes("Export cancelled")) setExportStatus("Export cancelled");
      else setError(message);
    } finally {
      setExportBusy(false);
    }
  }, [exportBusy, timelineRange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!video) return;
      const action = appKeyboardAction({
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        interactiveTarget: isInteractiveTarget(event.target),
      });
      if (!action) return;
      event.preventDefault();
      if (action === "toggle-playback") void togglePlayback();
      else if (action === "undo-correction" || action === "redo-correction") {
        void moveCorrectionHistory(action === "undo-correction" ? "undo" : "redo");
      } else if (action === "previous-cel" || action === "next-cel") {
        void navigateCel(action === "previous-cel" ? "previous" : "next");
      } else if (action === "previous-frame") stepFrame(-1);
      else if (action === "next-frame") stepFrame(1);
      else if (action === "first-frame") void showFrame(0);
      else if (action === "last-frame") void showFrame(video.playbackFrames.length - 1);
      else if (action === "increase-timeline-scale") scaleTimeline(1);
      else if (action === "decrease-timeline-scale") scaleTimeline(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveCorrectionHistory, navigateCel, scaleTimeline, showFrame, stepFrame, togglePlayback, video]);

  const toolDescription = tools?.available
    ? compactVersion(tools.ffmpegVersion)
    : tools?.error ?? "Checking FFmpeg";
  const selectedTiming = video?.playbackFrames[timelinePosition];
  const pendingCelValue = video ? "Pending analysis" : undefined;
  const readyCel = celInformation?.status === "ready" ? celInformation : null;
  const readyCorrection = correctionInformation?.status === "ready" ? correctionInformation : null;
  const unavailableCelValue = celInformation?.status === "failed" ? "Unavailable" : pendingCelValue;
  const playheadPercent = video && video.playbackFrames.length > 1
    ? (timelinePosition / (video.playbackFrames.length - 1)) * 100
    : 0;
  const effectiveSampleCount = video ? Math.min(video.playbackFrames.length, timelineSampleCount) : 0;
  const previousScaleIndex = video
    ? nextTimelineScaleIndex(timelineScaleIndex, -1, video.playbackFrames.length)
    : timelineScaleIndex;
  const nextScaleIndex = video
    ? nextTimelineScaleIndex(timelineScaleIndex, 1, video.playbackFrames.length)
    : timelineScaleIndex;
  const rangeFractions = video && timelineRange
    ? timelineRangeFractions(timelineRange, video.playbackFrames.length)
    : null;
  const analysisProgress = analysisStatus?.status === "running" ? analysisStatus.progress : null;
  const analysisPercent = analysisProgress ? Math.round(analysisProgress.fraction * 100) : null;
  const analysisDescription = analysisStatus?.status === "ready"
    ? analysisStatus.loadedFromSidecar ? "Analysis loaded" : "Analysis complete"
    : analysisStatus?.status === "failed"
      ? `Analysis failed: ${analysisStatus.error}`
      : analysisPercent === null ? "Starting analysis" : `${analysisStageLabel(analysisProgress!.stage)} ${analysisPercent}%`;

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>Animation Study</h1>
          <p className={tools?.available ? "tool-status" : "tool-status tool-error"} role="status">{toolDescription}</p>
          {video ? (
            <div className={analysisStatus?.status === "failed" ? "analysis-status tool-error" : "analysis-status"} role="status" aria-live="polite">
              <span>{analysisDescription}</span>
              {analysisStatus?.status === "running" ? (
                <progress aria-label="Background exposure analysis" max={1} value={analysisProgress?.fraction ?? undefined} />
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="top-bar-actions">
          {cacheStatus ? <output className="cache-status" aria-live="polite">{cacheStatus}</output> : null}
          <button disabled={cacheBusy || analysisStatus?.status === "running"} onClick={() => void clearUnusedCache()}>
            {cacheBusy ? "Clearing..." : "Clear unused cache"}
          </button>
          <button ref={openButton} className="open-button" disabled={busy || tools?.available !== true} onClick={() => void openVideo()}>
            {busy && !video ? "Opening..." : "Open video"}
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="viewer" aria-busy={busy}>
          {video ? (
            <>
              <video
                ref={videoElement}
                className="source-video"
                src={video.playbackUrl}
                preload="auto"
                playsInline
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                  setPlaying(false);
                  requestedTimelinePosition.current = video.playbackFrames.length - 1;
                  setTimelinePosition(video.playbackFrames.length - 1);
                }}
                onError={() => setError("The source could not be played by the embedded media decoder")}
              />
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
          <dl className="info-list">
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
          </dl>
          <section className="corrections" aria-label="Exposure corrections">
            <h2>Corrections</h2>
            <div className="correction-history-buttons">
              <button
                aria-keyshortcuts="Control+Z Meta+Z"
                disabled={!readyCorrection?.canUndo || correctionBusy}
                onClick={() => void moveCorrectionHistory("undo")}
              >Undo</button>
              <button
                aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y Meta+Y"
                disabled={!readyCorrection?.canRedo || correctionBusy}
                onClick={() => void moveCorrectionHistory("redo")}
              >Redo</button>
            </div>
            <p className="representative-readout">
              {readyCorrection
                ? `Representative frame ${readyCorrection.representativeFrameNumber}`
                : correctionInformation?.status === "failed" ? "Corrections unavailable" : "Pending analysis"}
            </p>
            <div className="correction-buttons">
              <button
                disabled={!readyCorrection?.canSplit || correctionBusy}
                onClick={() => void correctExposure("split")}
              >Split before frame</button>
              <button
                disabled={!readyCorrection?.canMergePrevious || correctionBusy}
                onClick={() => void correctExposure("merge-previous")}
              >Merge previous</button>
              <button
                disabled={!readyCorrection?.canMergeNext || correctionBusy}
                onClick={() => void correctExposure("merge-next")}
              >Merge next</button>
              <button
                disabled={!readyCorrection || readyCorrection.selectedFrameIsRepresentative || correctionBusy}
                onClick={() => void correctExposure("select-representative")}
              >Use frame as representative</button>
            </div>
            {readyCorrection?.boundaryBeforeNeedsReview ? (
              <div className="boundary-confirmation">
                <p>Uncertain boundary before this frame</p>
                <div>
                  <button disabled={correctionBusy} onClick={() => void correctExposure("confirm-same")}>Confirm hold</button>
                  <button disabled={correctionBusy} onClick={() => void correctExposure("confirm-changed")}>Confirm change</button>
                </div>
              </div>
            ) : null}
          </section>
        </aside>
      </section>

      <section className="timeline-panel" aria-label="Timeline filmstrip" aria-busy={timelineLoading}>
        <header className="timeline-header">
          <span>Timeline</span>
          <span className="timeline-density">{effectiveSampleCount} {effectiveSampleCount === 1 ? "sample" : "samples"}</span>
          <span className="timeline-range-readout">
            {timelineRange
              ? `Frames ${timelineRange.startPosition + 1} to ${timelineRange.endPosition + 1} (${timelineRange.frameCount})`
              : "No range selected"}
          </span>
          <div className="timeline-range-controls">
            <button
              disabled={!timelineRange || analysisStatus?.status !== "ready" || exportBusy}
              onClick={() => void exportSelection()}
            >{exportBusy ? "Exporting..." : "Export"}</button>
            {exportBusy ? (
              <button onClick={() => void window.animationStudy.cancelExport()}>Cancel export</button>
            ) : null}
            <button
              title="Select a range with pointer drag, or hold Shift while dragging"
              aria-pressed={rangeSelectionMode}
              disabled={!video}
              onClick={() => setRangeSelectionMode((active) => !active)}
            >Select range</button>
            <button
              aria-label="Clear timeline range"
              disabled={!timelineRange}
              onClick={() => setTimelineRange(null)}
            >Clear</button>
          </div>
          {exportStatus ? <output className="export-status" aria-live="polite">{exportStatus}</output> : null}
          <div className="timeline-scale-controls" aria-label="Timeline scale controls">
            <button
              aria-label="Decrease timeline scale"
              aria-keyshortcuts="-"
              disabled={!video || previousScaleIndex === timelineScaleIndex}
              onClick={() => scaleTimeline(-1)}
            >−</button>
            <button
              aria-label="Increase timeline scale"
              aria-keyshortcuts="+"
              disabled={!video || nextScaleIndex === timelineScaleIndex}
              onClick={() => scaleTimeline(1)}
            >+</button>
          </div>
        </header>
        <div
          ref={timelineScroller}
          className="timeline"
          onWheel={(event) => {
            if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
              event.preventDefault();
              event.currentTarget.scrollLeft += event.deltaY;
            }
          }}
        >
        {video ? (
          timelineThumbnails.length > 0 ? (
            <div
              ref={filmstrip}
              className={rangeSelectionMode ? "filmstrip selecting-range" : "filmstrip"}
              role="slider"
              aria-label="Timeline playhead"
              aria-valuemin={1}
              aria-valuemax={video.playbackFrames.length}
              aria-valuenow={timelinePosition + 1}
              aria-valuetext={`Frame ${timelinePosition + 1} of ${video.playbackFrames.length}`}
              aria-keyshortcuts="ArrowLeft ArrowRight Home End Shift+ArrowLeft Shift+ArrowRight"
              tabIndex={0}
              onPointerDown={(event) => {
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                const position = timelinePositionForPointer(event.clientX, event.currentTarget);
                if (position === null) return;
                if (rangeSelectionMode || event.shiftKey) {
                  timelineRangeAnchor.current = position;
                  setTimelineRange(createInclusiveTimelineRange(position, position, video.playbackFrames.length));
                } else {
                  timelineRangeAnchor.current = null;
                }
                showFrame(position);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  moveTimelinePointer(event.clientX, event.currentTarget);
                }
              }}
              onPointerUp={(event) => {
                moveTimelinePointer(event.clientX, event.currentTarget);
                const selectedRange = timelineRangeAnchor.current !== null;
                timelineRangeAnchor.current = null;
                if (selectedRange) setRangeSelectionMode(false);
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                timelineRangeAnchor.current = null;
                setRangeSelectionMode(false);
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
              {rangeFractions ? (
                <div
                  className="timeline-range-selection"
                  style={{
                    left: `${rangeFractions.left * 100}%`,
                    width: `${rangeFractions.width * 100}%`,
                  }}
                  aria-hidden="true"
                />
              ) : null}
              <div ref={playhead} className="timeline-playhead" style={{ left: `${playheadPercent}%` }} aria-hidden="true" />
            </div>
          ) : (
            <p className="timeline-message">{timelineLoading ? "Loading filmstrip" : "Filmstrip unavailable"}</p>
          )
        ) : (
          <p className="timeline-message">Timeline</p>
        )}
        </div>
      </section>

      <footer className="transport">
        <button aria-label="First frame" aria-keyshortcuts="Home" disabled={!video || busy || timelinePosition === 0} onClick={() => void showFrame(0)}>│◀</button>
        <button aria-label="Previous frame" aria-keyshortcuts="ArrowLeft ," disabled={!video || busy || timelinePosition === 0} onClick={() => stepFrame(-1)}>◀</button>
        <button className="play-button" aria-label={playing ? "Pause" : "Play"} aria-keyshortcuts="Space" disabled={!video || busy} onClick={() => void togglePlayback()}>{playing ? "❚❚" : "▶"}</button>
        <output className="frame-readout" aria-live={playing ? "off" : "polite"} aria-atomic="true">{selectedTiming ? selectedTiming.displayFrameNumber.toString().padStart(6, "0") : "------"}</output>
        <button aria-label="Next frame" aria-keyshortcuts="ArrowRight ." disabled={!video || busy || timelinePosition === video.playbackFrames.length - 1} onClick={() => stepFrame(1)}>▶</button>
        <button aria-label="Last frame" aria-keyshortcuts="End" disabled={!video || busy || timelinePosition === video.playbackFrames.length - 1} onClick={() => video && void showFrame(video.playbackFrames.length - 1)}>▶│</button>
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
      <dd title={title}>{value ?? "-"}</dd>
    </div>
  );
}

function analysisStageLabel(stage: AnalysisJobStage): string {
  if (stage === "analysis-proxy") return "Preparing analysis";
  if (stage === "luma-chroma-scores") return "Comparing color";
  return "Comparing edges";
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

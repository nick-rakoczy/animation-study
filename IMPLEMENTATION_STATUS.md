# Implementation status

Last updated: 2026-09-14

This checklist tracks implementation against [PROJECT_PLAN.md](PROJECT_PLAN.md). An item is checked only when the code exists and has relevant verification. Partially implemented plan items are split into smaller tasks.

## Current focus

Synchronized source playback with audio. Normal playback must follow source presentation timing. Frame stepping must remain silent.

## Phase 0: decisions and technical proofs

- [x] Record the blocking product decisions in the project plan.
- [x] Clarify that synchronized audio playback is required and waveform display is not required.
- [x] Build the command-line timing probe specified by the plan.
- [x] Confirm that the Electron renderer starts on Linux.
- [ ] Collect the full fixture set for clean holds, compression noise, camera motion, dissolves, variable frame rate, and returning drawings.
- [ ] Complete the Clip Studio Paint compatibility test on Windows.
- [ ] Test the playback design on Linux.
- [ ] Test the playback design on Windows.
- [ ] Set and document the minimum supported FFmpeg version.

## Phase 1: media and timing proof

- [x] Check that `ffmpeg` and `ffprobe` are available and report their versions.
- [x] Open a local video through the Electron file picker.
- [x] Read normalized video-stream metadata with `ffprobe`.
- [x] Read one presentation timestamp and duration record per decoded source frame.
- [x] Store timestamps, durations, rates, and time bases as rational numbers.
- [x] Assign a zero-based integer timeline position and one-based display number to every frame.
- [x] Preserve the original frame timestamps instead of deriving identity from floating-point seconds.
- [x] Generate a sampled contact sheet for manual timing verification.
- [x] Retrieve an exact requested frame through a bounded proxy cache.
- [x] Verify a retrieved proxy against an independently decoded reference frame.
- [x] Support input paths containing spaces in the integration test.
- [x] Add exact previous, next, first, and last frame controls.
- [x] Add `Left`, `Right`, `,`, `.`, `Home`, and `End` frame navigation.
- [ ] Measure cached forward and backward frame steps against the 1/30-second target.
- [ ] Add normal source-timed video playback.
- [ ] Add synchronized source audio during playback.
- [ ] Keep frame stepping silent after audio playback exists.
- [ ] Map playback progress to exact indexed frame positions for constant-rate video.
- [ ] Map playback progress to exact indexed frame positions for variable-rate video.
- [ ] Add `Space` play and pause behavior.
- [ ] Add automated audio and video synchronization coverage.
- [ ] Confirm that one-hour sources do not require a full-resolution frame sequence.

## Phase 2: exposure analysis

- [ ] Create small luma, chroma, and edge analysis proxies.
- [ ] Compare adjacent frames and store the component scores.
- [ ] Classify boundaries as same, changed, or uncertain with two thresholds.
- [ ] Build chronological exposure spans without merging non-adjacent matches.
- [ ] Add the sensitivity setting and reset action.
- [ ] Add selected-range reanalysis and a preview cel count.
- [ ] Add job progress and cancellation.
- [ ] Save partial and completed analysis results to the sidecar project.
- [ ] Load saved analysis without rerunning completed work.
- [ ] Tune the detector against the fixture set.

## Phase 3: study interface

- [x] Build the Electron, React, and TypeScript application shell.
- [x] Keep filesystem and process access in the Electron main process.
- [x] Use a sandboxed renderer with a typed preload API.
- [x] Fit the current frame into the available viewer area.
- [x] Keep frame text outside the video image.
- [x] Show the selected timeline frame, timestamp, duration, source size, and codec.
- [ ] Show the selected cel number, exposure start, hold length, cadence label, and elapsed duration.
- [ ] Add the sampled filmstrip timeline.
- [ ] Keep thumbnail aspect ratios without black thumbnail containers.
- [ ] Add exact playhead scrubbing across sampled thumbnails.
- [ ] Add horizontal timeline scrolling.
- [ ] Add `+` and `-` timeline scale controls.
- [ ] Add inclusive timeline range selection.
- [ ] Add `Shift+Left` and `Shift+Right` cel navigation.
- [ ] Add split, merge, representative-frame selection, and boundary confirmation.
- [ ] Add undo and redo for every correction.
- [ ] Add accessible focus behavior and complete keyboard coverage.
- [ ] Keep the interface responsive while background analysis runs.

## Phase 4: export

- [ ] Export one opaque PNG for each exposure present in an inclusive selection.
- [ ] Preserve source resolution and decoded display orientation.
- [ ] Restart export-local cel numbering at `0001`.
- [ ] Prefix names with the selected starting source-frame number.
- [ ] Create and reuse the source-specific export folder when names cannot collide.
- [ ] Create a numbered sibling folder when intended names already exist.
- [ ] Never overwrite an existing export file.
- [ ] Leave no output that looks complete after cancellation or failure.
- [ ] Validate exported fixtures in the target Clip Studio Paint version.

## Phase 5: persistence and release

- [ ] Create the SQLite `<source filename>.animstudy` sidecar.
- [ ] Store source metadata, timing, analysis settings, exposures, scores, and corrections.
- [ ] Add source-content hashing for cache invalidation.
- [ ] Add crash-safe sidecar writes.
- [ ] Add cache cleanup controls.
- [ ] Add platform-specific FFmpeg installation instructions.
- [ ] Test corrupt files, missing codecs, rotation, non-square pixels, non-ASCII paths, read-only sources, low disk space, and cancelled jobs.
- [ ] Package an x86-64 Linux AppImage.
- [ ] Verify the complete workflow on a clean Linux machine.

## Deferred and excluded

- [x] Do not implement waveform display.
- [x] Do not implement macOS support for the first release.
- [x] Do not implement crop, masks, motion compensation, or foreground segmentation.
- [x] Do not implement drawing, annotations, onion skin, or side-by-side comparison.
- [x] Do not create or edit `.clip` files directly.
- [x] Do not export audio or companion timing files.

## Verification record

| Date | Check | Result |
| --- | --- | --- |
| 2026-09-14 | `npm test` | Passed timing, FFmpeg integration, and renderer asset-path tests |
| 2026-09-14 | `npm run build` | Passed TypeScript and production renderer builds |
| 2026-09-14 | Constant-rate fixture at `24000/1001` | Returned 24 indexed frames with exact rational timing |
| 2026-09-14 | Variable-timestamp fixture | Preserved distinct presentation timestamps and frame durations |
| 2026-09-14 | Exact proxy comparison | Cached frame pixels matched the independently decoded PNG |
| 2026-09-14 | Electron Linux startup under Xvfb | Window remained running without application startup errors |
| 2026-09-14 | Electron rendered-DOM inspection | React root contained the viewer, information panel, and transport controls |
| 2026-09-14 | `git diff --check` | Passed |

## Known limitations in the current build

- The application displays and steps through still proxies. It does not play video or audio yet.
- The frame-by-frame filmstrip timeline does not exist yet.
- Exposure detection, cel information, corrections, sidecar persistence, and export do not exist yet.
- The proxy cache clears when a source opens because source-content hashing has not been implemented.
- The 1/30-second stepping target has not been measured on the reference machine.
- The minimum supported FFmpeg version has not been selected.

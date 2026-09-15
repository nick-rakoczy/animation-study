# Implementation status

Last updated: 2026-09-15

This checklist tracks implementation against [PROJECT_PLAN.md](PROJECT_PLAN.md). An item is checked only when the code exists and has relevant verification. Partially implemented plan items are split into smaller tasks.

## Current focus

Phase 5 is complete. Remaining work is tracked in Phase 0, plus the user-owned Clip Studio Paint check.

## Phase 0: decisions and technical proofs

- [x] Record the blocking product decisions in the project plan.
- [x] Clarify that synchronized audio playback is required and waveform display is not required.
- [x] Build the command-line timing probe specified by the plan.
- [x] Confirm that the Electron renderer starts on Linux.
- [x] Collect the full fixture set for clean holds, compression noise, camera motion, dissolves, variable frame rate, and returning drawings.
- [ ] Complete the Clip Studio Paint compatibility test on Windows. User-owned manual validation.
- [x] Test the playback design on Linux.
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
- [x] Measure cached forward and backward frame steps against the 1/30-second target.
- [x] Add normal source-timed video playback.
- [x] Add synchronized source audio during playback.
- [x] Keep frame stepping silent after audio playback exists.
- [x] Map playback progress to exact indexed frame positions for constant-rate video.
- [x] Map playback progress to exact indexed frame positions for variable-rate video.
- [x] Add `Space` play and pause behavior.
- [x] Add automated audio and video synchronization coverage.
- [x] Confirm that one-hour sources do not require a full-resolution frame sequence.

## Phase 2: exposure analysis

- [x] Create small luma, chroma, and edge analysis proxies.
- [x] Compare adjacent frames and store the component scores.
- [x] Classify boundaries as same, changed, or uncertain with two thresholds.
- [x] Build chronological exposure spans without merging non-adjacent matches.
- [x] Add the sensitivity setting and reset action.
- [x] Add selected-range reanalysis and a preview cel count.
- [x] Add job progress and cancellation.
- [x] Save partial and completed analysis results to the sidecar project.
- [x] Load saved analysis without rerunning completed work.
- [x] Tune the detector against the fixture set.

## Phase 3: study interface

- [x] Build the Electron, React, and TypeScript application shell.
- [x] Keep filesystem and process access in the Electron main process.
- [x] Use a sandboxed renderer with a typed preload API.
- [x] Fit the current frame into the available viewer area.
- [x] Keep frame text outside the video image.
- [x] Show the selected timeline frame, timestamp, duration, source size, and codec.
- [x] Show the selected cel number, exposure start, hold length, cadence label, and elapsed duration.
- [x] Add the sampled filmstrip timeline.
- [x] Keep thumbnail aspect ratios without black thumbnail containers.
- [x] Add exact playhead scrubbing across sampled thumbnails.
- [x] Add horizontal timeline scrolling.
- [x] Add `+` and `-` timeline scale controls.
- [x] Add inclusive timeline range selection.
- [x] Add `Shift+Left` and `Shift+Right` cel navigation.
- [x] Add split, merge, representative-frame selection, and boundary confirmation.
- [x] Add undo and redo for every correction.
- [x] Add accessible focus behavior and complete keyboard coverage.
- [x] Keep the interface responsive while background analysis runs.

## Phase 4: export

- [x] Export one opaque PNG for each exposure present in an inclusive selection.
- [x] Preserve source resolution and decoded display orientation.
- [x] Restart export-local cel numbering at `0001`.
- [x] Prefix names with the selected starting source-frame number.
- [x] Create and reuse the source-specific export folder when names cannot collide.
- [x] Create a numbered sibling folder when intended names already exist.
- [x] Never overwrite an existing export file.
- [x] Leave no output that looks complete after cancellation or failure.
- [ ] Validate exported fixtures in the target Clip Studio Paint version. User-owned manual validation.

## Phase 5: persistence and release

- [x] Create the SQLite `<source filename>.animstudy` sidecar.
- [x] Store source metadata, timing, analysis settings, exposures, scores, and corrections.
- [x] Add source-content hashing for cache invalidation.
- [x] Add crash-safe sidecar writes.
- [x] Add cache cleanup controls.
- [x] Add platform-specific FFmpeg installation instructions.
- [x] Test corrupt files, missing codecs, rotation, non-square pixels, non-ASCII paths, read-only sources, low disk space, and cancelled jobs.
- [x] Package an x86-64 Linux AppImage.
- [x] Verify the complete workflow on a clean Linux machine.

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
| 2026-09-14 | `npm test` | Passed timing, FFmpeg integration, playback synchronization, one-hour source, exposure analysis, detector fixtures, selected-cel information, sidecar save and load, job cancellation, and renderer tests |
| 2026-09-14 | `npm run typecheck` | Passed core and renderer TypeScript checks |
| 2026-09-14 | `npm run build` | Passed TypeScript and production renderer builds |
| 2026-09-14 | Constant-rate fixture at `24000/1001` | Returned 24 indexed frames with exact rational timing |
| 2026-09-14 | Variable-timestamp fixture | Preserved distinct presentation timestamps and frame durations |
| 2026-09-14 | Exact proxy comparison | Cached frame pixels matched the independently decoded PNG |
| 2026-09-14 | Electron Linux startup under Xvfb | Window remained running without application startup errors |
| 2026-09-14 | Electron rendered-DOM inspection | React root contained the viewer, information panel, and transport controls |
| 2026-09-14 | Electron Linux playback smoke test | Loaded a VP9/Opus proxy with both streams starting at zero; video reached `HAVE_ENOUGH_DATA` and playback advanced |
| 2026-09-14 | Automated audio/video synchronization fixture | A decoded flash and tone retained their relative timing through proxy generation within 30 ms |
| 2026-09-14 | One-hour 1080p source fixture | Kept at most three 1280-pixel PNG proxies plus one compressed WebM playback file; created no full-resolution frame sequence |
| 2026-09-14 | `npm run benchmark:frame-step` | Across 200 cached 1280x720 PNG loads per direction, forward steps had a 1.743 ms maximum and backward steps had a 1.998 ms maximum; both passed the 33.333 ms target |
| 2026-09-14 | Analysis proxy fixture | Cached reusable 64x36 lossless FFV1 luma/chroma and edge streams; decoded three frames per stream and detected the fixture's color and edge changes |
| 2026-09-14 | Adjacent-frame scoring fixture | Streamed the analysis proxy with bounded memory, stored normalized component scores for both boundaries, and reused the validated score file |
| 2026-09-14 | Boundary classification tests | Applied inclusive same and changed thresholds with an uncertain interval; the decoded color and edge changes classified as changed |
| 2026-09-14 | Exposure-span tests | Built chronological spans from changed boundaries, retained uncertain boundaries for review, and kept returning drawings in separate exposures |
| 2026-09-14 | Sensitivity tests | Mapped the 0 through 100 setting to both thresholds, changed the exposure count without rescoring frames, and reset to the default value of 50 |
| 2026-09-14 | Selected-range analysis tests | Reclassified only internal boundaries at the requested sensitivity, previewed the resulting cel count, handled one-frame selections, and rejected invalid ranges |
| 2026-09-14 | Analysis job tests | Reported frame progress for proxy generation and both scoring passes, reported cache hits, cancelled scoring after one frame, and left no partial score file |
| 2026-09-14 | Analysis sidecar tests | Created a SQLite `.animstudy` file, saved a partial score prefix, replaced it with a validated completed analysis in one transaction, and preserved the prior snapshot after invalid input |
| 2026-09-14 | Analysis reload tests | Reconstructed scores and exposures from a matching completed sidecar without calling the analyzer, treated partial and mismatched data as cache misses, and rejected inconsistent completed rows without rerunning work |
| 2026-09-14 | Detector fixture suite | Classified clean and noisy holds, camera motion, a dissolve, variable frame rate, a returning drawing, and a one-frame drawing at the defaults; the noisy-hold maximum was 0.000361 and the deliberate-change minimum was 0.107789 |
| 2026-09-14 | Selected-cel information tests | Opened with pending analysis, completed hold detection in the background, then reported cel number, exposure start, exact hold count, cadence, and rational elapsed duration for both exposures |
| 2026-09-14 | Sampled filmstrip timeline tests | Requested a bounded sample across the source, returned the first and last source frames with numbered PNG data URLs, and rendered the samples below the viewer |
| 2026-09-14 | Filmstrip thumbnail layout test | Kept each image at its intrinsic aspect ratio, removed cover cropping, and removed black thumbnail container fills |
| 2026-09-14 | Exact timeline scrubbing tests | Mapped the full filmstrip width to clamped integer source-frame positions, tracked pointer drags, and queued the newest exact frame while decoding |
| 2026-09-14 | Horizontal filmstrip scrolling test | Kept thumbnails at a fixed display height in a content-width row, enabled native horizontal overflow, and mapped vertical wheel input to horizontal movement |
| 2026-09-14 | Timeline scale tests | Changed filmstrip sampling through five bounded density levels, skipped ineffective levels for short sources, and added button and keyboard controls |
| 2026-09-14 | Inclusive timeline range tests | Normalized forward and reverse drags, counted both endpoint frames, gave one-frame ranges visible width, and added range-mode and Shift-drag controls |
| 2026-09-14 | Adjacent-cel navigation tests | Resolved previous and next exposure starts from any frame in a hold, stopped at file boundaries, and bound the actions to shifted arrow keys |
| 2026-09-14 | Exposure correction tests | Split and merged spans, changed representative frames, confirmed uncertain boundaries as held or changed, reindexed chronological cels, and exposed guarded controls in the information panel |
| 2026-09-14 | Correction history tests | Undid and redid complete exposure timelines across representative, split, and merge edits; cleared redo after a new correction; and added buttons plus standard keyboard shortcuts |
| 2026-09-14 | Accessibility and keyboard tests | Moved focus to the timeline after opening without overriding later user focus, focused the timeline on pointer use, exposed slider values and shortcuts, preserved native control keys, and tested every application shortcut through one mapping |
| 2026-09-14 | Responsive background analysis tests | Exposed live analysis stages and progress through typed IPC, kept analysis separate from interaction busy state, and retrieved an exact frame while analysis was pending or completing |
| 2026-09-15 | Inclusive exposure export tests | Exported exactly one opaque RGB PNG for each exposure crossing a selected range, used corrected representative positions, and exposed export through the directory picker and typed preload API |
| 2026-09-15 | Export resolution and orientation test | Exported a 96 by 54 source carrying 90-degree display rotation as an opaque 54 by 96 PNG without resizing |
| 2026-09-15 | Export naming and folder tests | Restarted cel numbering at `0001`, used the selected starting frame prefix, reused a source folder for non-colliding names, and created `_2` for a repeated export |
| 2026-09-15 | Export safety tests | Used exclusive file creation, preserved the first export during a collision, exposed cancellation through typed IPC, and removed hidden staging files after cancellation or decoder failure |
| 2026-09-15 | Clip Studio documentation review | Confirmed 5.1.4 as the current Windows release and recorded the official multi-file cel import, preference behavior, and manual assignment workflow in `docs/CLIP_STUDIO_COMPATIBILITY.md`; execution in Clip Studio Paint remains pending |
| 2026-09-15 | Sidecar project persistence tests | Stored normalized stream and container metadata, exact per-frame timing, analysis settings, component scores, exposures, and the corrected timeline in SQLite; reopened the source through the application service and restored its edited exposure boundary and representative frame without reanalysis |
| 2026-09-15 | Source-content fingerprint tests | Used SHA-256 file-content fingerprints for analysis, display-frame, thumbnail, and playback cache keys; changed content invalidated keys even when path, size, and modification time stayed fixed |
| 2026-09-15 | Crash-safe sidecar tests | Enabled SQLite WAL journaling with full synchronization and verified that an interrupted correction transaction rolled back to the prior complete project |
| 2026-09-15 | Cache cleanup tests | Added a renderer control and typed IPC method that remove unused cache files while preserving all active-source cache directories; rejected filesystem-root cleanup |
| 2026-09-15 | FFmpeg installation guidance | Added Linux and Windows instructions, official download links, PATH checks, missing-codec guidance, and platform-specific startup errors |
| 2026-09-15 | Release edge-case suite | Passed corrupt-container and missing-decoder diagnostics, display rotation, non-square pixels, a read-only source at a non-ASCII path, simulated disk exhaustion rollback, and analysis and export cancellation cleanup |
| 2026-09-15 | Linux AppImage package | Built `Animation-Study-0.1.0-x86_64.AppImage`, a 64-bit x86-64 ELF AppImage with SHA-256 `08fa24059faa1de8d0be9d3c3fb06765f17b5108653214b00d4260a44d0eb6a6` |
| 2026-09-15 | Clean Ubuntu 24.04 release workflow | In a clean amd64 container with no Node.js or developer dependencies, extracted the AppImage, analyzed a four-frame fixture, reopened its SQLite project from the sidecar, and exported the expected two PNG cels |
| 2026-09-15 | Packaged Electron startup | The production x86-64 package remained running under a virtual X display until the 10-second smoke-test timeout |
| 2026-09-15 | Final Phase 5 verification | `npm run typecheck` passed; all 15 test files passed; the production renderer build and `git diff --check` passed |
| 2026-09-15 | `git diff --check` | Passed |
| 2026-09-15 | Seek-friendly playback proxy | Limited VP9 keyframe spacing to 12 frames, versioned the playback cache identity, and verified the encoded keyframe interval with FFprobe |

## Known limitations in the current build

- Opening a source currently waits for a complete 1280-pixel-wide VP9/Opus playback proxy. Long-source generation progress and cancellation have not been implemented.
- Clip Studio Paint EX 5.1.4 is not installed in this Linux workspace. The Windows compatibility procedure and expected fixture are documented, but the manual import test and `.clip` acceptance fixture still require the target application on Windows.
- The minimum supported FFmpeg version has not been selected.

# Animation study tool plan

## Product goal

Build a local desktop application for studying animation timing. A user opens a video, scrubs it frame by frame, sees where drawings change, reads how long each drawing is held, corrects detection mistakes, and exports reference frames for a draw-over in Clip Studio Paint.

The application should keep two facts separate:

- A source frame is a decoded video frame at a specific timestamp.
- An exposure is a cel image plus the number of timeline frames for which it remains visible.

This distinction is the basis of the application. Removing duplicate image files must not remove timing information.

## Product questions and answers

The questions in this section are ordered by how much they affect the design. The recorded answers define the first release.

### Blocking product questions

1. Which operating systems must the first release support?
   - Answered: Linux is required for the first release. Windows support is desirable next. macOS is out of scope.
   - This decides the desktop framework, file picker behavior, FFmpeg packaging, and release work.

2. Is the source material mostly hand-drawn animation, stop motion, 3D animation, or a mixture?
   - Answered: optimize for traditional hand-drawn animation, including anime. Sources may contain compression artifacts.
   - Camera moves, grain, subtitles, compositing effects, and 3D motion can make every decoded frame different even when a character drawing is held.

3. What should the project timeline frame rate be?
   - Answered: preserve the source frame rate and replay at the source frame rate. Each decoded source frame occupies one timeline position. "On ones," "on twos," and "on threes" describe how many consecutive source frames hold one image, regardless of frame rate.
   - Preserve presentation timestamps as well as frame order. Variable-frame-rate video has no single playback rate, so playback must follow each frame's presentation timing while cadence labels continue to count frame positions.

4. Does deduplication mean only adjacent held frames, or should a drawing that returns later reuse the earlier cel?
   - Answered: collapse adjacent holds only. Every later exposure becomes a new chronological cel, even if its image matches an earlier exposure. For example, `A A B B A A` becomes three cels and may be named A, B, C.

5. How much manual correction is required in the first useful version?
   - Answered: include split, merge, representative-frame selection, undo and redo, and range reanalysis with different sensitivity in the first usable version.
   - Detection will not be perfect on real video, so correction is part of the core workflow rather than later polish.

6. What should Clip Studio Paint export accomplish automatically?
   - Answered: export one numbered PNG per adjacent exposure. For source frames `A A B B C C`, export three images. Do not export repeated copies for held frames. Automatic Clip Studio timeline reconstruction is not required for the first usable version.

7. What size and duration must feel responsive?
   - Answered: support files up to one hour. Most sources will be 1080p, with occasional 4K sources. Initial loading may take time. After loading, video must play at its source timing in real time, and forward or backward frame steps must respond within 1/30 second.
   - The user will open full episodes. The application must not depend on extracting every full-resolution frame to disk before use.

Automatic exposure detection remains an internal loading step. Its purpose is to find useful adjacent holds for animation practice, not to reconstruct every visual change. A subtle change during a fade may remain a separate one-frame exposure. Exact fade analysis is out of scope.

### Workflow questions

8. Should opening a video create a saved project, or can the first version be a disposable session?
   - Answered: create a sidecar project file and update it as the user works. Store metadata, analysis results, and manual corrections so later sessions do not start fresh. Keep the source video external.

9. Does the user need in and out points before analysis and export?
   - Answered: do not use persistent in and out points. The application always opens and processes the full file. Export uses a temporary range selection on the timeline.

10. Is audio playback needed, or only visual frame stepping?
    - Answered: include synchronized source audio during in-app playback. Frame stepping is silent. Do not export audio for Clip Studio Paint.

11. Is real-time playback required, or is exact frame stepping and scrubbing enough at first?
    - Answered: both are required. After initial loading, playback must run in real time at the source timing. Forward and backward frame steps must respond within 1/30 second.

12. Should the viewer offer zoom, pan, fit-to-window, a checkerboard background, or overlays?
    - Answered: fit the video to the available viewer area. Do not add zoom, pan, fullscreen, a checkerboard, or video overlays. Show frame numbers, cel number when applicable, and hold length in a separate information panel.

13. Should the timeline show every source frame, only detected exposures, or both?
    - Answered: use a sampled filmstrip across the full timeline width. Size thumbnails to the timeline height and preserve their aspect ratio without black containers. At close zoom, show every source frame that fits. As the user zooms out, reduce density to every nth frame rather than squeezing thumbnails. The playhead still selects the exact source frame at any position.
    - Do not draw exposure boundary lines or exposure blocks. They would add too much noise because hand-drawn animation changes often. Show the selected frame's cel and hold data in the information panel.
    - Allow the user to drag across the timeline to highlight an inclusive range for export.

14. What should happen while analysis is incomplete?
    - Answered: open the viewer after basic metadata and playback data are ready. Generate timeline thumbnails and detect holds in the background. Save completed work to the sidecar as it becomes available.

15. Are keyboard controls important?
    - Answered: include `Space` for play or pause; `Left`, `Right`, `,`, and `.` for one-frame stepping; `Shift+Left` and `Shift+Right` for previous or next cel; `Home` and `End` for the file bounds; and `+` and `-` for timeline scale. Do not add in/out shortcuts. JKL shuttle controls are not required.

### Detection questions

16. Should the detector ignore a crop or masked part of the image?
    - Answered: always compare and display the full source frame. Do not add crop or mask tools. Moving backgrounds, subtitles, or similar changes may produce extra exposures.

17. Should users be able to tune sensitivity and see why two frames matched?
    - Answered: provide a simple sensitivity slider, a reset-to-default action, and a preview count of the cels the selected range would produce. Do not show difference images or raw scores in the normal interface. Keep underlying settings and scores in the sidecar for reproducibility and debugging.

18. Should the tool detect cadence labels such as ones, twos, and threes, or only report exact hold lengths?
    - Answered: show the selected cel's exact source-frame hold count, derived cadence label, and elapsed duration in the information panel. Do not show cadence summaries for ranges or the full file.

19. How should scene cuts behave?
    - Answered: do not detect or display scene cuts. Process cut boundaries with the same adjacent-frame comparison as the rest of the video. Do not reset cel numbering.

20. How should fades, camera moves, motion blur, and cross-dissolves appear?
    - Answered: treat fades, dissolves, camera moves, and motion blur as ordinary frame changes. Do not stabilize footage, compensate for motion, or recover held drawings beneath transitions. These passages may produce one cel per source frame.

21. Is color equality important, or should near-identical line art count as the same drawing despite color or lighting changes?
    - Answered: meaningful color, brightness, or lighting changes create a new cel even when the drawing is unchanged. Compare color, luma, and edges while tolerating small compression artifacts. Retain the full-color source frame for display and export.

### Export questions

22. Which Clip Studio Paint edition and version is the target, and on which OS?
    - Answered: target Clip Studio Paint EX on Windows and test against the latest available release. As of 2026-09-13, the official current release is 5.1.4.

23. Should exported cels use their chronological number or the source frame number?
    - Answered: use zero-padded chronological cel numbers such as `0001.png` and `0002.png`. Every selected-range export restarts at `0001`. Keep original source-frame and project cel positions in the sidecar.

24. Should the export preserve source resolution, use the study viewport crop, or resize to the Clip Studio canvas?
    - Answered: preserve the full source resolution and decoded display orientation. Do not crop or resize exported frames.

25. Is transparency required?
    - Answered: no. Export opaque PNGs. Do not perform background removal, alpha generation, or line-art extraction.

26. Does the user need an exposure sheet, a contact sheet, or a human-readable timing report alongside the frames?
    - Answered: no companion files. The Clip Studio export folder contains numbered PNGs only. The user highlights a sequence on the timeline and clicks Export; the app exports only the exposure cels present in that selected range.

27. How should rerunning an export handle an existing folder?
    - Answered: create a source-specific subfolder inside the directory selected by the user. Name it `<source filename>_frames`, including the source extension. Prefix each PNG with the selected starting source-frame number, followed by the export-local cel number. Example: `video.mp4_frames/1234_0001.png`.
    - Reuse the source-specific folder when the new starting-frame prefix cannot collide. If the intended output names already exist, create a numbered sibling folder such as `video.mp4_frames_2`. Never overwrite existing files.

## Agreed first-release behavior

This is the agreed user workflow.

1. The user opens a complete local video. The viewer becomes available after basic metadata and playback indexing are ready. The application preserves source frame order and playback timing.
2. The application reads stream metadata and indexes timestamps with `ffprobe`.
3. The viewer shows the frame at the playhead. Dragging the playhead requests nearby proxy frames and displays the closest source frame for the selected timeline frame.
   Normal playback includes the synchronized source audio.
4. In the background, the application generates timeline thumbnails, compares adjacent frames, and groups visually equivalent frames into exposures. It saves partial results to the sidecar.
5. The timeline draws a filmstrip of aspect-correct thumbnails. It samples every nth source frame as needed for the current timeline scale and width. A full-duration ruler and playhead retain exact frame positions even when the UI omits thumbnails.
6. A separate information panel reports the timeline frame, source timestamp, cel number, exact hold length, and a derived label such as "on 2s." The viewer has no text overlay.
7. The user corrects the result by splitting or merging blocks and can change the representative image without changing the hold.
8. The user highlights an inclusive range on the timeline and clicks Export. The app writes one numbered PNG for each exposure present in that range and no companion files.

## Timeline and timing rules

Use integer timeline frames for editing and rational numbers for rates and source timestamps. Do not use floating-point seconds as the identity of a frame.

Assign each decoded source frame an integer timeline position in presentation order. Preserve its original presentation timestamp and duration. Frame stepping moves by integer position, while playback schedules each frame from its recorded timing. Do not generate or discard frames to conform the source to another rate.

The timeline is a source-frame filmstrip rather than a set of stretched exposure blocks. Exposure data appears only in the information panel. Do not draw exposure boundary marks. Thumbnail sampling affects display density only. It never changes frame stepping, playback, detection, or export.

Examples at any constant source frame rate:

- Exposure 1 starts at frame 1 and lasts 2 frames. It is on twos.
- Exposure 2 starts at frame 3 and lasts 3 frames. It is on threes.
- Exposure 3 starts at frame 6 and lasts 1 frame. It is on ones.

A sequence should only receive a cadence summary when the data supports it. Holds of 2, 2, 2, 1 should display the exact pattern, not simply "on twos."

## Deduplication design

Do not make FFmpeg's `mpdecimate` filter the source of truth. It can drop similar frames, but the application needs every input timestamp, the comparison result, user-adjustable sensitivity, and reversible grouping.

Use this first-pass detector:

1. Decode frames in presentation order.
2. Convert a small analysis copy to luma and normalize its size.
3. Compare adjacent frames with more than one signal. Start with luma, chroma, and edge-map differences so meaningful color changes count while small compression artifacts do not.
4. Classify the pair as same, changed, or uncertain using two thresholds.
5. Begin a new exposure on changed pairs. Flag uncertain boundaries for review.
6. Store the score and settings with the boundary so the result can be inspected and reproduced.

Favor useful study frames over exhaustive transition reconstruction. Fades and other subtle per-frame changes may remain as runs of one-frame exposures.

Use a content hash for cache invalidation only. Do not use it to merge non-adjacent exposures.

Minimum correction operations:

- Split an exposure at the playhead.
- Merge an exposure with the previous or next exposure.
- Mark a boundary as confirmed.
- Choose any source frame inside an exposure as its representative image.
- Reanalyze a selection at a different sensitivity.
- Undo and redo every edit.

## Suggested data model

Keep the model independent of the UI framework.

```text
Project
  source path and fingerprint
  source video metadata
  source timing metadata
  analysis settings
  exposures
  edit history or persisted corrected result

Exposure
  stable id
  start timeline frame
  duration in timeline frames
  representative source-frame id
  chronological cel name
  automatic boundary scores
  user-confirmed flags

SourceFrame
  stable id
  presentation timestamp
  presentation duration
  decoded-frame index
  cache key

```

Each exposure owns one chronological cel. A later exposure never reuses an earlier cel, even when their representative images match.

## Technical shape

Selected technical approach:

- A desktop shell with a web UI for the viewer, timeline, and inspector.
- The Electron main process for filesystem access, process management, caching, and export.
- `ffprobe` for stream and frame metadata.
- FFmpeg for decoding proxy images, exact export frames, and later playback proxies.
- A SQLite sidecar named `<source filename>.animstudy` for durable metadata, frame timing, analysis results, and corrections. Keep disposable frame proxies in a separate cache.

Use Electron with React and TypeScript. It provides one bundled Chromium runtime across Linux and Windows, which reduces webview differences in a media-heavy interface. Confirm the playback and media-process design with a small Linux and Windows spike before building the full UI. Keep FFmpeg calls behind a narrow interface.

Do not bundle FFmpeg. Require `ffmpeg` and `ffprobe` on `PATH`, check both at startup, and report their detected versions. If either command is missing, show platform-specific installation instructions and do not attempt media operations. The current development machine already has both commands available.

### Process boundaries

```text
UI
  opens a project, requests frames, edits exposure boundaries
  |
Application service
  owns project state, jobs, cache, cancellation, export
  |
Media adapter
  runs ffprobe and FFmpeg with argument arrays, parses output
  |
Filesystem
  source video, proxy cache, project file, export folder
```

Never construct media commands by joining untrusted paths into a shell string. Pass executable arguments as an array. Capture stderr, exit status, progress, and cancellation as structured job state.

## Clip Studio Paint compatibility

Clip Studio Paint treats layers or layer folders inside an animation folder as cels. Its documentation says users can import multiple images into an animation folder, and numeric cel names are its normal default. It also assigns cels to specific timeline frames, where an assignment remains visible until the next assigned cel. This means a folder of unique numbered PNGs does not, by itself, describe irregular holds.

The first release should provide one image export preset:

### Exposure cels

```text
video.mp4_frames/
  1234_0001.png
  1234_0002.png
  1234_0003.png
```

The actual folder name is `<source filename>_frames`. For example, exporting `video.mp4` from source frame 1234 creates paths such as `video.mp4_frames/1234_0001.png`.

Run a compatibility spike against the target Clip Studio version:

1. Import numeric PNG cels into an animation folder and record their resulting layer names and order.
2. Test whether multi-file import assigns cels automatically under each relevant preference setting.
3. Confirm that an imported cel can be assigned manually to the intended timeline frame.
4. Save a tiny `.clip` fixture and written import instructions as an acceptance test for future releases.

Relevant official documentation:

- [Clip Studio Paint: animation folders and cels](https://help.clip-studio.com/en-us/manual_en/600_animation/Animation_folders_and_cels.htm)
- [Clip Studio Paint: assigning cels to the timeline](https://help.clip-studio.com/en-us/manual_en/600_animation/Assigning_cels_to_the_timeline.htm)
- [Clip Studio Paint: importing and exporting a timeline](https://help.clip-studio.com/en-us/manual_en/600_animation/Importing_and_exporting_a_timeline_%28EX%29.htm)
- [Clip Studio Paint: latest release notes](https://www.clipstudio.net/en/dl/release_note/latest/)
- [FFmpeg filter documentation, including mpdecimate](https://ffmpeg.org/ffmpeg-filters.html#mpdecimate)
- [ffprobe documentation](https://ffmpeg.org/ffprobe.html)

## Delivery phases

### Phase 0: answer and test the unknowns

- Record answers to the blocking questions in the decision log below.
- Collect a small test set with a clean hold, compression noise, camera motion, a dissolve, variable frame rate, and a repeated cel after intervening motion.
- Complete the Clip Studio compatibility spike.
- Confirm the Electron playback design and specify the minimum supported FFmpeg version.

Exit condition: the team has a written timing rule, a demonstrated Clip Studio import workflow, and representative sample clips that can become fixtures.

### Phase 1: media and timing proof

- Open a local video.
- Read stream metadata and frame timestamps.
- Map decoded source frames to integer timeline positions without changing their presentation timing.
- Display an exact frame for a requested timeline position.
- Step forward and backward without drift.
- Play the source audio in sync during normal playback and remain silent during frame stepping.
- Prepare the entire file without requiring in and out points.

Exit condition: automated tests cover constant and variable frame rate mapping, playback runs in real time after loading, and forward and backward frame steps land on expected reference frames within 1/30 second on the reference machine.

### Phase 2: exposure analysis

- Generate analysis proxies and cache them by source fingerprint and settings.
- Compare adjacent frames and build exposure spans.
- Show available hold lengths in the information panel and a pending state for frames that have not been analyzed.
- Add sensitivity, job progress, and cancellation.
- Save and reload the analysis result.

Exit condition: the clean-hold fixtures are exact, noisy fixtures meet an agreed error target, and no operation loses source timing.

### Phase 3: study interface

- Build the fit-to-area viewer, transport controls, information panel, sampled filmstrip timeline, and horizontal timeline scrolling.
- Add split, merge, representative-frame selection, reanalysis of a selection, undo, and redo.
- Add keyboard navigation and accessible focus behavior.
- Keep interaction responsive while analysis runs.

Exit condition: a user can correct every false split or false merge in the test set without editing files by hand.

### Phase 4: export

- Export one numbered PNG per exposure.
- Add inclusive timeline-range selection, numbering, and existing-folder handling.
- Validate the exported fixture in the target Clip Studio Paint version.

Exit condition: the export contains exactly one image for each exposure present in the selected range, the images have the expected pixels and names, and the documented Clip Studio workflow succeeds.

### Phase 5: release work

- Package the first Linux release as an x86-64 AppImage.
- Check for `ffmpeg` and `ffprobe` on `PATH` and provide Linux and Windows installation guidance when they are missing.
- Add crash-safe project writes and cache cleanup controls.
- Test missing codecs, corrupt files, rotated video, paths with spaces and non-ASCII text, read-only sources, low disk space, and cancelled jobs.

Exit condition: a clean machine can install the application, analyze a fixture, reopen its project, and export without developer tools.

## MVP acceptance criteria

- Opening a supported local video shows a frame and its metadata without generating a full-resolution image sequence first.
- Normal playback includes synchronized source audio; frame stepping does not play audio.
- Each frame step advances by one decoded source frame, and playback follows source presentation timestamps without drift.
- Adjacent duplicate detection preserves the exact total timeline duration.
- The information panel shows the selected cel's start frame and hold length when analysis data is available.
- Users can correct a false split and a false merge, then reopen the project with those edits intact.
- Exported exposure cels use stable, zero-padded numeric names.
- Exporting a timeline selection includes no cels that occur only outside the selected range.
- Cancelling analysis or export leaves no result that looks complete.
- A documented test imports the output into the chosen Clip Studio Paint version.

## Tests worth writing early

- Source timing tests for 24, 25, 30, 24000/1001, and 30000/1001 fps.
- A variable-frame-rate fixture with known presentation timestamps.
- A two-frame hold with minor compression noise.
- An intentional one-frame drawing between two similar poses.
- A static character over a moving background.
- A slow camera pan and a dissolve, both expected to remain frame-by-frame in the first version.
- A drawing that returns later, represented as a new exposure and a new cel.
- Rotation metadata and non-square pixel metadata.
- Export names beyond 9999 and a source path containing spaces and non-ASCII characters.
- Project recovery after interruption during analysis and export.

## Main risks

- Near-duplicate detection is subjective. Mitigate it with conservative defaults, visible uncertainty, fixture-based tuning, and fast manual correction.
- Variable frame rate can play incorrectly if the implementation trusts an average frame rate. Preserve presentation timestamps and durations. Cadence labels still count decoded frame positions.
- A moving background prevents whole-frame duplicate detection. The user accepts extra exposures rather than crop or mask tools.
- Random seeks can feel slow with long groups of pictures. Use nearby proxy caching and measure before adding a persistent frame database.
- Clip Studio image import will not recreate irregular exposure timing from filenames alone. Document how to assign the exposure cels manually.
- Requiring system FFmpeg can produce version and codec differences. Detect versions at startup, define a tested minimum, and report decoder failures with the command diagnostics.

## Deferred features

- Drawing or annotation inside the application.
- Onion skin and side-by-side frame comparison.
- Audio waveform display. Synchronized source audio during normal playback remains required.
- Motion-compensated detection for pans and camera shake.
- Crop and detection masks.
- Automatic character or foreground segmentation.
- Direct creation or editing of `.clip` files.
- Expanded image-sequence export with one image per source frame.
- Automatic Clip Studio timeline reconstruction.
- Cloud storage, accounts, sharing, and collaboration.
- Batch analysis of a folder or full episode.

## Decision log

Fill this in before Phase 1. A decision can change later, but recording it prevents the timing and export rules from changing silently.

| Decision | Current proposal | Final answer | Date |
| --- | --- | --- | --- |
| First supported OS | Linux first | Linux required; Windows desired next; macOS out of scope | 2026-09-13 |
| Main source material | Hand-drawn animation in compressed video | Traditional hand-drawn animation, including anime; sources may be compressed | 2026-09-13 |
| Timeline and playback rate | Preserve the source timing | Preserve source frame rate and playback timing; cadence labels count held source frames | 2026-09-13 |
| Adjacent hold collapse | Always available | Detect adjacent holds automatically during loading | 2026-09-13 |
| Non-adjacent cel reuse | Do not reuse | Each chronological exposure is a new cel, even if its image matches an earlier exposure | 2026-09-13 |
| Required corrections | Split, merge, representative frame, reanalyze | Split, merge, representative-frame selection, undo and redo, and selected-range reanalysis | 2026-09-13 |
| First Clip Studio target | Exact edition, version, and OS needed | EX on Windows, latest available release; 5.1.4 as of 2026-09-13 | 2026-09-13 |
| MVP image export | Exposure cels | One numbered PNG per adjacent exposure; no repeated files for held frames | 2026-09-13 |
| Export numbering | Chronological cel numbers | Zero-padded numbers restarting at `0001` for each selected-range export | 2026-09-13 |
| Export path | User-selected folder | Create `<source filename>_frames/<starting source frame>_<cel number>.png` inside the selected folder | 2026-09-13 |
| Export collision handling | Ask before replacing | Reuse the source folder for noncolliding ranges; create a numbered sibling folder on collision; never overwrite | 2026-09-13 |
| Export dimensions | Preserve source pixels | Full source resolution and display orientation; no crop or resize | 2026-09-13 |
| Export transparency | Opaque source frame | Opaque PNG only; no background or line-art processing | 2026-09-13 |
| Source scale | 1080p and 10 minutes | Up to one hour; usually 1080p with occasional 4K | 2026-09-13 |
| Initial loading | Show the first frame quickly | Open after basic metadata and playback data are ready; generate thumbnails and holds in the background | 2026-09-13 |
| Exposure analysis role | User-visible background analysis | Internal loading step; useful adjacent holds matter, exact fade reconstruction does not | 2026-09-13 |
| Playback and stepping | Exact stepping first | Real-time source-timed playback; forward and backward steps within 1/30 second | 2026-09-13 |
| Viewer controls | Fit, zoom, pan, and overlay | Fit-to-area only; no zoom, pan, fullscreen, checkerboard, or overlays | 2026-09-13 |
| Frame information | Viewer overlay | Separate information panel with frame numbers, cel number when applicable, and hold length | 2026-09-13 |
| In and out points | Include | No persistent trim points; always process the full file and use a temporary timeline selection for export | 2026-09-13 |
| Saved projects | Sidecar project file | Required; persist metadata, analysis, and corrections while keeping the video external | 2026-09-13 |
| Sidecar format | JSON or SQLite | SQLite in `<source filename>.animstudy`; regenerable images use a separate cache | 2026-09-13 |
| Audio in MVP | No | Required for synchronized in-app playback; silent stepping and no audio export | 2026-09-13 |
| Companion export files | JSON and CSV | None; export numbered PNGs only | 2026-09-13 |
| Export range | Full file or trim range | Highlight an inclusive timeline sequence and export only the exposure cels present in it | 2026-09-13 |
| Desktop framework | Electron, React, and TypeScript | Electron with React and TypeScript | 2026-09-13 |
| FFmpeg delivery | System install during development; release policy open | Require `ffmpeg` and `ffprobe` on `PATH`; detect missing commands and show installation guidance | 2026-09-13 |
| Linux package | Not selected | AppImage first; native distribution packages deferred | 2026-09-13 |
| Linux architecture | Not selected | x86-64 only for the first release; ARM64 deferred | 2026-09-13 |

## First implementation task after decisions

Build a command-line timing probe before the full UI. Given a video, it should write:

- normalized stream metadata,
- one record per source frame with presentation timestamp and duration,
- one integer timeline position per decoded source frame,
- a contact sheet for manual verification.

This isolates the highest-risk timing logic. The viewer and deduplication stages can then consume the same tested mapping instead of each interpreting video time independently.

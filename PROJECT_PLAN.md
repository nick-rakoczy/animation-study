# Animation study tool plan

## Product goal

Build a local desktop application for studying animation timing. A user opens a video, scrubs it frame by frame, sees where drawings change, reads how long each drawing is held, corrects detection mistakes, and exports reference frames for a draw-over in Clip Studio Paint.

The application should keep two facts separate:

- A source frame is a decoded video frame at a specific timestamp.
- An exposure is a cel image plus the number of timeline frames for which it remains visible.

This distinction is the basis of the application. Removing duplicate image files must not remove timing information.

## Questions to answer first

The questions in this section are ordered by how much they affect the design. Answers to the first seven are enough to start the first milestone.

### Blocking product questions

1. Which operating systems must the first release support?
   - Recommended first answer: the developer's current desktop OS only, with Windows and macOS packaging deferred.
   - This decides the desktop framework, file picker behavior, FFmpeg packaging, and release work.

2. Is the source material mostly hand-drawn animation, stop motion, 3D animation, or a mixture?
   - Recommended first answer: optimize detection for hand-drawn animation with compressed video artifacts.
   - Camera moves, grain, subtitles, compositing effects, and 3D motion can make every decoded frame different even when a character drawing is held.

3. What should the project timeline frame rate be?
   - Recommended first answer: read the source rate, then let the user choose a study rate such as 24 fps before analysis.
   - The tool must define what "on twos" means for 23.976 fps, 25 fps, 29.97 fps, variable-frame-rate video, and footage with duplicated broadcast frames.

4. Does deduplication mean only adjacent held frames, or should a drawing that returns later reuse the earlier cel?
   - Recommended first answer: always collapse adjacent holds. Make non-adjacent cel reuse a separate, optional command.
   - Reusing a cel after intervening motion is useful, but a false match can conceal an intentional redraw.

5. How much manual correction is required in the first useful version?
   - Recommended first answer: users can split an exposure, merge it with a neighbor, choose its representative source frame, and restore the automatic result.
   - Detection will not be perfect on real video, so correction is part of the core workflow rather than later polish.

6. What should Clip Studio Paint export accomplish automatically?
   - Option A: export one numbered PNG per unique exposure. The user assigns the imported cels to the Clip Studio timeline.
   - Option B: export one PNG per timeline frame, including repeated images. Import is simple, but duplicate layers obscure the original cel holds.
   - Option C: export unique PNGs plus timeline data that reconstructs irregular holds. This gives the best result but requires a proven Clip Studio compatible interchange format or an import-side script.
   - Recommended first answer: ship A and B, then test C as a separate compatibility spike.

7. What size and duration must feel responsive?
   - Recommended first target: 1080p clips up to 10 minutes. Show the first frame quickly, analyze in the background, and allow cancellation.
   - Long films and 4K sources change cache, indexing, and memory requirements.

### Workflow questions

8. Should opening a video create a saved project, or can the first version be a disposable session?
   - Recommendation: use a small saved project file so manual corrections, trim ranges, frame-rate choices, and analysis settings survive restarts.

9. Does the user need in and out points before analysis and export?
   - Recommendation: yes. Animation study usually concerns a shot, and trimming reduces analysis time and export clutter.

10. Is audio playback needed, or only visual frame stepping?
    - Recommendation: omit audio from the first milestone unless dialogue or lip-sync study is a primary use case.

11. Is real-time playback required, or is exact frame stepping and scrubbing enough at first?
    - Recommendation: prioritize exact stepping. Add playback after the timing model is trustworthy.

12. Should the viewer offer zoom, pan, fit-to-window, a checkerboard background, or overlays?
    - Recommendation: start with fit, 100 percent zoom, pan, and a frame/time overlay.

13. Should the timeline show every source frame, only detected exposures, or both?
    - Recommendation: use a source-frame ruler and a row of exposure blocks. Each block has a thumbnail and a width proportional to its hold. A toggle can expand the view to individual source frames.

14. What should happen while analysis is incomplete?
    - Recommendation: allow normal scrubbing, display analyzed exposure blocks as they arrive, and mark the unfinished region.

15. Are keyboard controls important?
    - Recommendation: define them in the first version. At minimum, Left and Right step one timeline frame, Shift plus Left or Right jumps between exposures, Space toggles playback, and I/O set the trim range.

### Detection questions

16. Should the detector ignore a crop or masked part of the image?
    - This matters when subtitles, timecode, grain, or an animated background changes while the drawing under study is held.

17. Should users be able to tune sensitivity and see why two frames matched?
    - Recommendation: expose a simple sensitivity control and an optional difference view. Keep the underlying thresholds in project data for reproducible results.

18. Should the tool detect cadence labels such as ones, twos, and threes, or only report exact hold lengths?
    - Recommendation: store exact lengths. Derive labels from them. Show mixed or irregular timing honestly instead of forcing a cadence label.

19. How should scene cuts behave?
    - Recommendation: always start a new exposure at a cut. Never compare across a detected cut for adjacent hold collapse.

20. How should fades, camera moves, motion blur, and cross-dissolves appear?
    - Recommendation: treat them as frame-by-frame changes initially. Later, add an assisted mode that can stabilize or mask regions. Silent aggressive collapse would give misleading timing results.

21. Is color equality important, or should near-identical line art count as the same drawing despite color or lighting changes?
    - Recommendation: use a luma and edge comparison for automatic holds, but retain the full-color source frame for display and export.

### Export questions

22. Which Clip Studio Paint edition and version is the target, and on which OS?
    - Clip Studio Paint PRO has timeline length limits that may affect the workflow. Test against the exact installed edition.

23. Should exported cels use their chronological number or the source frame number?
    - Recommendation: default to zero-padded chronological cel names such as `0001.png`, `0002.png`, and write source frame and timestamp data to a manifest.

24. Should the export preserve source resolution, use the study viewport crop, or resize to the Clip Studio canvas?
    - Recommendation: preserve source pixels by default and offer crop and resize settings explicitly.

25. Is transparency required?
    - A video frame has no useful alpha channel. Creating line-art transparency is a separate image-processing feature and should not be implied by PNG export.

26. Does the user need an exposure sheet, a contact sheet, or a human-readable timing report alongside the frames?
    - Recommendation: export both `manifest.json` and `exposure-sheet.csv`. These provide a durable record even if Clip Studio timeline automation is deferred.

27. How should rerunning an export handle an existing folder?
    - Recommendation: show a conflict summary and require an explicit replace or new-folder choice. Do not mix stale and new frames.

## Proposed first-release behavior

These defaults let implementation begin while the open questions are answered.

1. The user opens a local video and selects a study frame rate.
2. The application reads stream metadata and indexes timestamps with `ffprobe`.
3. The viewer shows the frame at the playhead. Dragging the playhead requests nearby proxy frames and displays the closest source frame for the selected timeline frame.
4. The analyzer compares each frame with its immediate predecessor. It groups visually equivalent adjacent frames into an exposure.
5. The timeline draws one block per exposure. Its width equals the number of study frames in the hold. The block displays its cel number and a thumbnail when space permits.
6. The inspector reports the timeline frame, source timestamp, cel number, exact hold length, and a derived label such as "on 2s."
7. The user corrects the result by splitting or merging blocks and can change the representative image without changing the hold.
8. Export writes unique numbered PNGs, a JSON manifest, and a CSV exposure sheet. An alternate expanded export writes a numbered PNG for every timeline frame.

## Timeline and timing rules

Use integer timeline frames for editing and rational numbers for rates and source timestamps. Do not use floating-point seconds as the identity of a frame.

For each study frame `n`, map its time to `n * rate_denominator / rate_numerator`. Select the decoded source frame whose presentation interval contains that time. Preserve the original presentation timestamp and duration reported by the decoder.

The UI should distinguish these views:

- The source-frame view exposes decoded frames and their timestamps.
- The exposure view groups adjacent study frames that use the same cel.

Examples at a 24 fps study rate:

- Exposure 1 starts at frame 1 and lasts 2 frames. It is on twos.
- Exposure 2 starts at frame 3 and lasts 3 frames. It is on threes.
- Exposure 3 starts at frame 6 and lasts 1 frame. It is on ones.

A sequence should only receive a cadence summary when the data supports it. Holds of 2, 2, 2, 1 should display the exact pattern, not simply "on twos."

## Deduplication design

Do not make FFmpeg's `mpdecimate` filter the source of truth. It can drop similar frames, but the application needs every input timestamp, the comparison result, user-adjustable sensitivity, and reversible grouping.

Use this first-pass detector:

1. Decode frames in presentation order.
2. Convert a small analysis copy to luma and normalize its size.
3. Compare adjacent frames with more than one signal. Start with mean absolute pixel difference plus an edge-map difference.
4. Classify the pair as same, changed, or uncertain using two thresholds.
5. Begin a new exposure on changed pairs. Flag uncertain boundaries for review.
6. Store the score and settings with the boundary so the result can be inspected and reproduced.

Add an exact or perceptual hash for cache invalidation and optional non-adjacent cel matching. Do not rely on a hash alone for compressed footage.

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
  study rate
  in and out points
  analysis settings and optional mask
  exposures
  edit history or persisted corrected result

Exposure
  stable id
  start timeline frame
  duration in timeline frames
  representative source-frame id
  cel id
  automatic boundary scores
  user-confirmed flags

SourceFrame
  stable id
  presentation timestamp
  presentation duration
  decoded-frame index
  cache key

Cel
  stable id
  representative image
  chronological export name
```

An exposure refers to a cel. This allows a later exposure to reuse a cel without merging the two exposure spans.

## Technical shape

Recommended starting point:

- A desktop shell with a web UI for the viewer, timeline, and inspector.
- A small native backend process for filesystem access, process management, caching, and export.
- `ffprobe` for stream and frame metadata.
- FFmpeg for decoding proxy images, exact export frames, and later playback proxies.
- A project file in JSON during early development. Add a SQLite cache only when measured clip sizes justify it.

Tauri with React and TypeScript is a reasonable default because Rust and Node are installed in the current environment, but the OS answer should come first. Electron is a valid alternative if development speed and mature video UI integrations matter more than installer size. Keep FFmpeg calls behind a narrow interface so the desktop shell can change without rewriting analysis logic.

Do not bundle an FFmpeg binary until distribution requirements and license obligations have been reviewed. During development, discover a system installation and report its version. The current machine already has FFmpeg and ffprobe available.

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

The first release should provide two explicit export presets:

### Unique cels

```text
shot-name/
  0001.png
  0002.png
  0003.png
  manifest.json
  exposure-sheet.csv
```

`exposure-sheet.csv` should include at least `timeline_frame`, `cel_name`, `hold_frames`, `source_frame`, and `source_timestamp`.

### Expanded sequence

```text
shot-name-expanded/
  shot-name_000001.png
  shot-name_000002.png
  shot-name_000003.png
  ...
```

The expanded sequence preserves visual timing in filenames and frame count, but repeated PNGs are separate imported images. Explain that tradeoff in the export dialog.

Before claiming one-click timeline reconstruction, run a compatibility spike against the target Clip Studio version:

1. Import numeric PNG cels into an animation folder and record their resulting layer names and order.
2. Test whether multi-file import assigns cels automatically under each relevant preference setting.
3. Test a nonuniform exposure pattern such as 2, 3, 1, 4.
4. Investigate supported timeline interchange. Clip Studio's documented CSV exposure-sheet export cannot be imported back into Clip Studio Paint. Treat XDTS or any other format as unsupported until an official import path and a generated fixture are verified.
5. Save a tiny `.clip` fixture and written import instructions as an acceptance test for future releases.

Relevant official documentation:

- [Clip Studio Paint: animation folders and cels](https://help.clip-studio.com/en-us/manual_en/600_animation/Animation_folders_and_cels.htm)
- [Clip Studio Paint: assigning cels to the timeline](https://help.clip-studio.com/en-us/manual_en/600_animation/Assigning_cels_to_the_timeline.htm)
- [Clip Studio Paint: importing and exporting a timeline](https://help.clip-studio.com/en-us/manual_en/600_animation/Importing_and_exporting_a_timeline_%28EX%29.htm)
- [FFmpeg filter documentation, including mpdecimate](https://ffmpeg.org/ffmpeg-filters.html#mpdecimate)
- [ffprobe documentation](https://ffmpeg.org/ffprobe.html)

## Delivery phases

### Phase 0: answer and test the unknowns

- Record answers to the blocking questions in the decision log below.
- Collect a small test set with a clean hold, compression noise, camera motion, a dissolve, variable frame rate, and a repeated cel after intervening motion.
- Complete the Clip Studio compatibility spike.
- Choose the desktop framework and FFmpeg distribution policy.

Exit condition: the team has a written timing rule, a demonstrated Clip Studio import workflow, and representative sample clips that can become fixtures.

### Phase 1: media and timing proof

- Open a local video.
- Read stream metadata and frame timestamps.
- Map source timestamps to an integer study timeline.
- Display an exact frame for a requested timeline position.
- Step forward and backward without drift.
- Add in and out points.

Exit condition: automated tests cover constant and variable frame rate mapping, and manual stepping lands on expected reference frames.

### Phase 2: exposure analysis

- Generate analysis proxies and cache them by source fingerprint and settings.
- Compare adjacent frames and build exposure spans.
- Show hold lengths and uncertain boundaries.
- Add sensitivity, crop or mask, job progress, and cancellation.
- Save and reload the analysis result.

Exit condition: the clean-hold fixtures are exact, noisy fixtures meet an agreed error target, and no operation loses source timing.

### Phase 3: study interface

- Build the viewer, transport controls, frame/time display, exposure timeline, zoom, and horizontal scrolling.
- Add split, merge, representative-frame selection, reanalysis of a selection, undo, and redo.
- Add keyboard navigation and accessible focus behavior.
- Keep interaction responsive while analysis runs.

Exit condition: a user can correct every false split or false merge in the test set without editing files by hand.

### Phase 4: export

- Export unique cels as numbered PNGs.
- Export an expanded image sequence.
- Write the JSON manifest and CSV exposure sheet.
- Add crop, resize, numbering, range, and existing-folder handling.
- Validate the exported fixture in the target Clip Studio Paint version.

Exit condition: exported images have the expected pixels and names, the manifest durations sum to the selected range, and the documented Clip Studio workflow succeeds.

### Phase 5: release work

- Package the application for the first supported OS.
- Decide whether to bundle or discover FFmpeg and satisfy its license and notice requirements.
- Add crash-safe project writes and cache cleanup controls.
- Test missing codecs, corrupt files, rotated video, paths with spaces and non-ASCII text, read-only sources, low disk space, and cancelled jobs.

Exit condition: a clean machine can install the application, analyze a fixture, reopen its project, and export without developer tools.

## MVP acceptance criteria

- Opening a supported local video shows a frame and its metadata without generating a full-resolution image sequence first.
- Frame stepping uses the selected study rate and does not accumulate timestamp drift.
- Adjacent duplicate detection preserves the exact total timeline duration.
- Every exposure shows its start frame and hold length.
- Users can correct a false split and a false merge, then reopen the project with those edits intact.
- Exported unique cels use stable, zero-padded numeric names.
- The JSON and CSV exports reconstruct the exposure sequence, including irregular holds and later cel reuse.
- Expanded export produces one numbered image per selected timeline frame.
- Cancelling analysis or export leaves no result that looks complete.
- A documented test imports the output into the chosen Clip Studio Paint version.

## Tests worth writing early

- A rational-rate mapping test for 24, 25, 30, 24000/1001, and 30000/1001 fps.
- A variable-frame-rate fixture with known presentation timestamps.
- A two-frame hold with minor compression noise.
- An intentional one-frame drawing between two similar poses.
- A static character over a moving background.
- A slow camera pan and a dissolve, both expected to remain frame-by-frame in the first version.
- A cel that returns later, represented as two exposures that may share one cel.
- Rotation metadata and non-square pixel metadata.
- Export names beyond 9999 and a source path containing spaces and non-ASCII characters.
- Project recovery after interruption during analysis and export.

## Main risks

- Near-duplicate detection is subjective. Mitigate it with conservative defaults, visible uncertainty, fixture-based tuning, and fast manual correction.
- Variable frame rate can produce incorrect hold counts if the implementation trusts an average frame rate. Base mapping on presentation timestamps.
- A moving background prevents whole-frame duplicate detection. Add crop and masks before attempting motion compensation.
- Random seeks can feel slow with long groups of pictures. Use nearby proxy caching and measure before adding a persistent frame database.
- Clip Studio image import may not recreate irregular exposure timing. Keep unique-cel and expanded-sequence exports separate, and do not promise timeline automation before the compatibility spike passes.
- Bundled codec support and FFmpeg licensing vary by build and distribution method. Make this a release decision, not a late packaging detail.

## Deferred features

- Drawing or annotation inside the application.
- Onion skin and side-by-side frame comparison.
- Audio playback and waveform display.
- Motion-compensated detection for pans and camera shake.
- Automatic character or foreground segmentation.
- Direct creation or editing of `.clip` files.
- Cloud storage, accounts, sharing, and collaboration.
- Batch analysis of a folder or full episode.

## Decision log

Fill this in before Phase 1. A decision can change later, but recording it prevents the timing and export rules from changing silently.

| Decision | Current proposal | Final answer | Date |
| --- | --- | --- | --- |
| First supported OS | Developer's current desktop OS |  |  |
| Main source material | Hand-drawn animation in compressed video |  |  |
| Default study rate | Source-derived, user confirms; common default 24 fps |  |  |
| Adjacent hold collapse | Always available |  |  |
| Non-adjacent cel reuse | Optional, separate command |  |  |
| Required corrections | Split, merge, representative frame, reanalyze |  |  |
| First Clip Studio target | Exact edition, version, and OS needed |  |  |
| MVP export modes | Unique cels plus expanded sequence |  |  |
| MVP clip limit | 1080p and 10 minutes |  |  |
| Audio in MVP | No |  |  |
| Desktop framework | Tauri, React, and TypeScript pending OS answer |  |  |
| FFmpeg delivery | System install during development; release policy open |  |  |

## First implementation task after decisions

Build a command-line timing probe before the full UI. Given a video, trim range, and study frame rate, it should write:

- normalized stream metadata,
- one record per source frame with presentation timestamp and duration,
- one record per study frame showing its selected source frame,
- a contact sheet for manual verification.

This isolates the highest-risk timing logic. The viewer and deduplication stages can then consume the same tested mapping instead of each interpreting video time independently.

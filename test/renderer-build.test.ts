import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renderer build uses file-compatible relative asset paths", async () => {
  const html = await readFile("renderer-dist/index.html", "utf8");
  assert.match(html, /(?:src|href)="\.\/assets\//);
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//);
});

test("frame information panel includes completed and pending cel fields", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  for (const label of ["Cel", "Exposure start", "Hold length", "Cadence", "Elapsed duration"]) {
    assert.match(source, new RegExp(`label=\"${label}\"`));
  }
  assert.match(source, /Pending analysis/);
  assert.match(source, /getCelInformation/);
});

test("renderer includes the sampled timeline filmstrip", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  assert.match(source, /aria-label="Timeline filmstrip"/);
  assert.match(source, /getTimelineThumbnails\(timelineSampleCount\)/);
  assert.match(source, /timelineThumbnails\.map/);
});

test("timeline thumbnails preserve their image aspect ratio without black containers", async () => {
  const styles = await readFile("renderer/src/styles.css", "utf8");
  const thumbnailRule = styles.match(/\.timeline-thumbnail \{(?<rule>[^}]*)\}/s)?.groups?.rule;
  const imageRule = styles.match(/\.timeline-thumbnail img \{(?<rule>[^}]*)\}/s)?.groups?.rule;
  assert.ok(thumbnailRule);
  assert.ok(imageRule);
  assert.doesNotMatch(thumbnailRule, /background\s*:/);
  assert.match(imageRule, /width:\s*auto/);
  assert.match(imageRule, /height:\s*68px/);
  assert.doesNotMatch(imageRule, /object-fit\s*:/);
});

test("source video fits inside the viewer without changing its aspect ratio", async () => {
  const styles = await readFile("renderer/src/styles.css", "utf8");
  const viewportRule = styles.match(/\.video-viewport \{(?<rule>[^}]*)\}/s)?.groups?.rule;
  const videoRule = styles.match(/\.video-viewport video \{(?<rule>[^}]*)\}/s)?.groups?.rule;
  assert.ok(viewportRule);
  assert.ok(videoRule);
  assert.match(viewportRule, /position:\s*absolute/);
  assert.match(viewportRule, /inset:\s*20px/);
  assert.match(videoRule, /width:\s*100%/);
  assert.match(videoRule, /height:\s*100%/);
  assert.match(videoRule, /object-fit:\s*contain/);
});

test("filmstrip scrubbing maps pointer input to an exact playhead position", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  assert.match(source, /timelinePositionFromOffset/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /onPointerMove/);
  assert.match(source, /className="timeline-playhead"/);
  assert.match(source, /aria-valuenow=\{timelinePosition \+ 1\}/);
});

test("filmstrip scrolls horizontally without compressing thumbnails", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  const styles = await readFile("renderer/src/styles.css", "utf8");
  const filmstripRule = styles.match(/\.filmstrip \{(?<rule>[^}]*)\}/s)?.groups?.rule;
  assert.ok(filmstripRule);
  assert.match(source, /scrollLeft \+= event\.deltaY/);
  assert.match(styles, /overflow-x:\s*auto/);
  assert.match(filmstripRule, /width:\s*max-content/);
  assert.doesNotMatch(filmstripRule, /justify-content:\s*space-between/);
  assert.doesNotMatch(filmstripRule, /min-width:\s*100%/);
  assert.match(styles, /flex:\s*0 0 auto/);
});

test("timeline scroll follows the playhead", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  assert.match(source, /ref=\{timelineScroller\}/);
  assert.match(source, /ref=\{playhead\}/);
  assert.match(source, /scrollAdjustmentToReveal/);
  assert.match(source, /scroller\.scrollLeft \+= adjustment/);
  assert.match(source, /\[keepPlayheadInView, timelinePosition, timelineThumbnails\]/);
});

test("timeline scale controls and shortcuts change sample density", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  assert.match(source, /aria-label="Decrease timeline scale"/);
  assert.match(source, /aria-label="Increase timeline scale"/);
  assert.match(source, /appKeyboardAction/);
  assert.match(source, /aria-keyshortcuts="\+"/);
  assert.match(source, /aria-keyshortcuts="-"/);
  assert.match(source, /getTimelineThumbnails\(timelineSampleCount\)/);
});

test("timeline supports inclusive pointer range selection", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  assert.match(source, /createInclusiveTimelineRange/);
  assert.match(source, /aria-pressed=\{rangeSelectionMode\}/);
  assert.match(source, /rangeSelectionMode \|\| event\.shiftKey/);
  assert.match(source, /className="timeline-range-selection"/);
  assert.match(source, /Clear timeline range/);
});

test("shifted arrow keys navigate adjacent cels", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  assert.match(source, /action === "previous-cel"/);
  assert.match(source, /action === "next-cel"/);
  assert.match(source, /navigateCel\(action === "previous-cel" \? "previous" : "next"\)/);
  assert.match(source, /getAdjacentCelPosition/);
});

test("information panel exposes all exposure correction actions", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  for (const action of ["split", "merge-previous", "merge-next", "select-representative", "confirm-same", "confirm-changed"]) {
    assert.match(source, new RegExp(`correctExposure\\(\"${action}\"\\)`));
  }
  assert.match(source, /getCorrectionInformation/);
  assert.match(source, /Representative frame/);
  assert.match(source, /Uncertain boundary before this frame/);
});

test("exposure corrections have undo and redo controls and shortcuts", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  assert.match(source, /undoExposureCorrection/);
  assert.match(source, /redoExposureCorrection/);
  assert.match(source, /readyCorrection\?\.canUndo/);
  assert.match(source, /readyCorrection\?\.canRedo/);
  assert.match(source, /action === "undo-correction"/);
  assert.match(source, /action === "redo-correction"/);
});

test("renderer provides focus movement and accessible keyboard semantics", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  const styles = await readFile("renderer/src/styles.css", "utf8");
  assert.match(source, /filmstrip\.current\?\.focus\(\)/);
  assert.match(source, /event\.currentTarget\.focus\(\)/);
  assert.match(source, /aria-valuetext=/);
  assert.match(source, /aria-keyshortcuts=/);
  assert.match(source, /<dl className="info-list">/);
  assert.match(source, /<output className="frame-readout" aria-live=\{playing \? "off" : "polite"\}/);
  assert.match(styles, /:focus-visible/);
});

test("frame stepping seeks the playback proxy without requesting display PNGs", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  const showFrame = source.slice(source.indexOf("const showFrame"), source.indexOf("const timelinePositionForPointer"));
  assert.match(showFrame, /element\.pause\(\)/);
  assert.match(showFrame, /element\.currentTime = playbackSeekTime\(playbackFrame\)/);
  assert.doesNotMatch(source, /animationStudy\.getFrame/);
  assert.doesNotMatch(source, /imageDataUrl.*Source frame/);
});

test("renderer reports background analysis without blocking controls", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  assert.match(source, /getBackgroundAnalysisStatus/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /<progress aria-label="Background exposure analysis"/);
  assert.doesNotMatch(source, /setBusy\(analysisStatus/);
});

test("renderer exports the inclusive timeline selection", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  assert.match(source, /window\.animationStudy\.exportSelection\(timelineRange\)/);
  assert.match(source, />\{exportBusy \? "Exporting\.\.\." : "Export"\}<\/button>/);
  assert.match(source, /!timelineRange \|\| analysisStatus\?\.status !== "ready" \|\| exportBusy/);
  assert.match(source, /aria-live="polite">\{exportStatus\}/);
  assert.match(source, /window\.animationStudy\.cancelExport\(\)/);
});

test("renderer exposes unused-cache cleanup with progress and results", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  assert.match(source, /window\.animationStudy\.clearUnusedCache\(\)/);
  assert.match(source, /Clear unused cache/);
  assert.match(source, /cacheBusy \? "Clearing\.\.\."/);
  assert.match(source, /className="cache-status" aria-live="polite"/);
});

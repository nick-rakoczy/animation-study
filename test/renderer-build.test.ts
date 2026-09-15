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
  assert.match(source, /scrollLeft \+= event\.deltaY/);
  assert.match(styles, /overflow-x:\s*auto/);
  assert.match(styles, /width:\s*max-content/);
  assert.match(styles, /flex:\s*0 0 auto/);
});

test("timeline scale controls and shortcuts change sample density", async () => {
  const source = await readFile("renderer/src/App.tsx", "utf8");
  assert.match(source, /aria-label="Decrease timeline scale"/);
  assert.match(source, /aria-label="Increase timeline scale"/);
  assert.match(source, /event\.key === "\+"/);
  assert.match(source, /event\.key === "-"/);
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

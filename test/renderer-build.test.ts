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
  assert.match(source, /getTimelineThumbnails\(12\)/);
  assert.match(source, /timelineThumbnails\.map/);
});

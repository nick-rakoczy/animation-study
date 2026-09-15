import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renderer build uses file-compatible relative asset paths", async () => {
  const html = await readFile("renderer-dist/index.html", "utf8");
  assert.match(html, /(?:src|href)="\.\/assets\//);
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//);
});

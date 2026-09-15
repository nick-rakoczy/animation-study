import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { clearCacheDirectories } from "../src/cache-cleanup.js";

test("clears unused cache directories and preserves the active source", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "animation-study-cache-cleanup-test-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  const active = join(root, "active");
  const stale = join(root, "stale");
  await Promise.all([mkdir(active), mkdir(stale)]);
  await writeFile(join(active, "current.webm"), "keep");
  await writeFile(join(stale, "old.png"), "remove-me");

  assert.deepEqual(await clearCacheDirectories(root, [active]), {
    removedFileCount: 1,
    removedBytes: 9,
  });
  assert.equal(await readFile(join(active, "current.webm"), "utf8"), "keep");
  await assert.rejects(readFile(join(stale, "old.png")));
});

test("refuses to clear a filesystem root", async () => {
  await assert.rejects(clearCacheDirectories("/"), /Refusing/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Linux releases include the AppImage updater feed", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    build?: { publish?: { provider?: string; owner?: string; repo?: string } };
  };
  assert.match(packageJson.dependencies?.["electron-updater"] ?? "", /^\^6\./);
  assert.match(packageJson.scripts?.["dist:linux"] ?? "", /--publish never/);
  assert.deepEqual(packageJson.build?.publish, {
    provider: "github",
    owner: "nick-rakoczy",
    repo: "animation-study",
  });
});

test("the AppImage updater requires confirmation before download and restart", async () => {
  const source = await readFile("src/main/app-updater.ts", "utf8");
  assert.match(source, /autoUpdater\.autoDownload = false/);
  assert.match(source, /buttons: \["Download update", "Not now"\]/);
  assert.match(source, /autoUpdater\.downloadUpdate\(\)/);
  assert.match(source, /"download-progress"/);
  assert.match(source, /buttons: \["Restart now", "Later"\]/);
  assert.match(source, /autoUpdater\.quitAndInstall/);
});

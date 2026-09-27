import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ensureAppImageInstalled } from "../src/main/appimage-installation.js";

test("an AppImage launched from Downloads is copied to Applications", () => {
  const home = mkdtempSync(join(tmpdir(), "animation-study-install-"));
  const download = join(home, "Downloads", "Animation Study.AppImage");
  const applications = join(home, "Applications");
  try {
    mkdirSync(join(home, "Downloads"));
    writeFileSync(download, "appimage contents", { mode: 0o644 });
    const installation = ensureAppImageInstalled(download, "1.2.3", applications);
    assert.deepEqual(installation, {
      path: join(applications, "Animation-Study-1.2.3-x86_64.AppImage"),
      copied: true,
    });
    assert.equal(readFileSync(installation.path, "utf8"), "appimage contents");
    assert.equal(readFileSync(download, "utf8"), "appimage contents");
    assert.ok(statSync(installation.path).mode & 0o111);
    assert.deepEqual(ensureAppImageInstalled(installation.path, "1.2.3", applications), {
      path: installation.path,
      copied: false,
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

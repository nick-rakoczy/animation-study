import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { registerAppImageDesktopEntry } from "../src/main/linux-desktop-entry.js";

test("the current AppImage owns one desktop entry across upgrades", () => {
  const dataHome = mkdtempSync(join(tmpdir(), "animation-study-desktop-"));
  const desktopPath = join(dataHome, "applications", "com.animationstudy.app.desktop");
  try {
    registerAppImageDesktopEntry("/opt/Animation Study 1.0.0.AppImage", "1.0.0", dataHome);
    registerAppImageDesktopEntry("/opt/Animation Study 1.1.0.AppImage", "1.1.0", dataHome);
    registerAppImageDesktopEntry("/opt/Animation Study 1.0.0.AppImage", "1.0.0", dataHome);
    const entry = readFileSync(desktopPath, "utf8");
    assert.match(entry, /^Name=Animation Study$/m);
    assert.match(entry, /^Exec="\/opt\/Animation Study 1\.1\.0\.AppImage"$/m);
    assert.match(entry, /^X-AnimationStudy-Version=1\.1\.0$/m);
  } finally {
    rmSync(dataHome, { recursive: true, force: true });
  }
});

test("desktop Exec escapes special characters in the AppImage path", () => {
  const dataHome = mkdtempSync(join(tmpdir(), "animation-study-desktop-"));
  const desktopPath = join(dataHome, "applications", "com.animationstudy.app.desktop");
  try {
    registerAppImageDesktopEntry('/opt/a%$`\\"b.AppImage', "1.0.0", dataHome);
    const entry = readFileSync(desktopPath, "utf8");
    assert.ok(entry.includes("a%%"));
    assert.ok(entry.includes(String.raw`\\$`));
    assert.ok(entry.includes("\\\\`"));
    assert.ok(entry.includes(String.raw`\\\\`));
    assert.ok(entry.includes(String.raw`\\"`));
  } finally {
    rmSync(dataHome, { recursive: true, force: true });
  }
});

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { compareVersions } from "../release-update.js";

const desktopFileName = "com.animationstudy.app.desktop";

/** Register the AppImage in the user's XDG application directory. */
export function registerAppImageDesktopEntry(
  appImagePath: string,
  version: string,
  dataHome = process.env.XDG_DATA_HOME,
): void {
  if (!isAbsolute(appImagePath) || /[\r\n\0]/.test(appImagePath)) {
    throw new Error("APPIMAGE must be an absolute path without line breaks");
  }
  if (compareVersions(version, version) === null) throw new Error("Invalid application version");

  const dataDirectory = dataHome && isAbsolute(dataHome) ? dataHome : join(homedir(), ".local", "share");
  const applicationsDirectory = join(dataDirectory, "applications");
  const desktopPath = join(applicationsDirectory, desktopFileName);
  const existing = existsSync(desktopPath) ? readFileSync(desktopPath, "utf8") : null;
  const installedVersion = existing?.match(/^X-AnimationStudy-Version=(.+)$/m)?.[1];
  if (installedVersion && (compareVersions(installedVersion, version) ?? -1) > 0) return;

  // Desktop Entry Exec uses double quotes and doubles percent signs for literal paths.
  const escapedPath = appImagePath.replace(/[%\\"$`]/g, (character) => {
    if (character === "%") return "%%";
    // The Desktop Entry string parser consumes one escaping layer before Exec is parsed.
    return character === "\\" ? "\\\\\\\\" : `\\\\${character}`;
  });
  const content = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Animation Study",
    `Exec="${escapedPath}"`,
    "Terminal=false",
    "Categories=Graphics;",
    `X-AnimationStudy-Version=${version}`,
    "",
  ].join("\n");
  if (existing === content) return;

  mkdirSync(applicationsDirectory, { recursive: true });
  const temporaryPath = join(applicationsDirectory, `.${desktopFileName}.${randomUUID()}`);
  try {
    writeFileSync(temporaryPath, content, { mode: 0o644 });
    renameSync(temporaryPath, desktopPath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { compareVersions } from "../release-update.js";

export interface AppImageInstallation {
  readonly path: string;
  readonly copied: boolean;
}

/** Copy an AppImage from a temporary download location into ~/Applications. */
export function ensureAppImageInstalled(
  sourcePath: string,
  version: string,
  applicationsDirectory = join(homedir(), "Applications"),
): AppImageInstallation {
  if (!isAbsolute(sourcePath) || /[\r\n\0]/.test(sourcePath)) {
    throw new Error("APPIMAGE must be an absolute path without line breaks");
  }
  if (compareVersions(version, version) === null) throw new Error("Invalid application version");
  if (resolve(dirname(sourcePath)) === resolve(applicationsDirectory)) {
    return { path: sourcePath, copied: false };
  }

  const destination = join(applicationsDirectory, `Animation-Study-${version}-x86_64.AppImage`);
  mkdirSync(applicationsDirectory, { recursive: true });
  const temporaryPath = join(applicationsDirectory, `.Animation-Study-${randomUUID()}.AppImage`);
  try {
    copyFileSync(sourcePath, temporaryPath);
    chmodSync(temporaryPath, statSync(sourcePath).mode | 0o111);
    renameSync(temporaryPath, destination);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
  return { path: destination, copied: true };
}

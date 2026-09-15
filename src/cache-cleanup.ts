import { lstat, mkdir, readdir, rm } from "node:fs/promises";
import { parse, resolve } from "node:path";

export interface CacheCleanupResult {
  readonly removedFileCount: number;
  readonly removedBytes: number;
}

export async function clearCacheDirectories(
  cacheRoot: string,
  preservedDirectories: readonly string[] = [],
): Promise<CacheCleanupResult> {
  const root = resolve(cacheRoot);
  if (root === parse(root).root) throw new Error("Refusing to clear a filesystem root as a cache");
  await mkdir(root, { recursive: true });
  const preserved = new Set(preservedDirectories.map((path) => resolve(path)));
  let removedFileCount = 0;
  let removedBytes = 0;

  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (preserved.has(path)) continue;
    const usage = await diskUsage(path);
    removedFileCount += usage.fileCount;
    removedBytes += usage.bytes;
    await rm(path, { force: true, recursive: true });
  }
  return { removedFileCount, removedBytes };
}

async function diskUsage(path: string): Promise<{ fileCount: number; bytes: number }> {
  const information = await lstat(path);
  if (!information.isDirectory()) return { fileCount: 1, bytes: information.size };
  let fileCount = 0;
  let bytes = 0;
  for (const entry of await readdir(path)) {
    const child = await diskUsage(resolve(path, entry));
    fileCount += child.fileCount;
    bytes += child.bytes;
  }
  return { fileCount, bytes };
}

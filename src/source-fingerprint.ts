import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export async function sourceContentFingerprint(
  sourcePath: string,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const hash = createHash("sha256");
  const stream = createReadStream(sourcePath, { signal });
  for await (const chunk of stream) hash.update(chunk as Buffer);
  signal?.throwIfAborted();
  return `sha256:${hash.digest("hex")}`;
}

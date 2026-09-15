import { spawn } from "node:child_process";

export interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export class ProcessError extends Error {
  constructor(
    message: string,
    readonly executable: string,
    readonly args: readonly string[],
    readonly result?: ProcessResult,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProcessError";
  }
}

export function runProcess(
  executable: string,
  args: readonly string[],
  signal?: AbortSignal,
  onStdout?: (chunk: string) => void,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      onStdout?.(chunk);
    });
    child.stderr.on("data", (chunk: string) => (stderr += chunk));

    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();

    child.on("error", (error) => {
      signal?.removeEventListener("abort", abort);
      reject(new ProcessError(`Could not start ${executable}: ${error.message}`, executable, args, undefined, { cause: error }));
    });
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      const result = { stdout, stderr, exitCode: code ?? -1 };
      if (signal?.aborted) {
        reject(new ProcessError(`${executable} was cancelled`, executable, args, result));
      } else if (result.exitCode !== 0) {
        const diagnostic = result.stderr.trim();
        const suffix = diagnostic.length > 0 ? `: ${diagnostic}` : "";
        reject(new ProcessError(`${executable} exited with code ${result.exitCode}${suffix}`, executable, args, result));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Delete a folder, retrying while Windows still holds a file in it. A browser, a runner or a virus
 * scan keeps a handle open for a moment after it is done, and Windows refuses the delete (EBUSY,
 * EPERM, ENOTEMPTY) until it lets go. Node's `rm` has `maxRetries` for this, but Bun ignores it:
 * `rmSync(dir, { recursive: true, force: true, maxRetries: 20 })` throws EBUSY at once on a locked
 * file. So the retry lives here, and every folder delete that can race a process uses it.
 */
import { rmSync } from "node:fs";
import { rm } from "node:fs/promises";

const RETRY_CODES = new Set(["EBUSY", "EPERM", "ENOTEMPTY", "EACCES", "EMFILE", "ENFILE"]);
const RETRY_PAUSE_MS = 100;
const DEFAULT_TIMEOUT_MS = 10_000;

function retryable(error: unknown): boolean {
  return RETRY_CODES.has((error as NodeJS.ErrnoException | null)?.code ?? "");
}

/** Remove `dir` and everything in it, retrying a held file for up to `timeoutMs`; throws the last error after that. */
export function removeDirSync(dir: string, timeoutMs = DEFAULT_TIMEOUT_MS): void {
  const deadline = Date.now() + timeoutMs;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!retryable(error) || Date.now() >= deadline) throw error;
      Atomics.wait(pause, 0, 0, RETRY_PAUSE_MS);
    }
  }
}

/** {@link removeDirSync} without blocking the event loop between tries. */
export async function removeDir(dir: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!retryable(error) || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
    }
  }
}

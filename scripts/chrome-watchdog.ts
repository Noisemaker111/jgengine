import { spawnSync } from "node:child_process";

import { removeDirSync } from "./removeDir";

/**
 * Ends a capture's Chrome when the process that launched it is gone. `launchChrome` starts one of
 * these, detached, beside every non-persistent browser: `bun scripts/chrome-watchdog.ts <launcher
 * pid> <chrome pid> <user-data-dir>`. It polls both pids; when Chrome exits it leaves, and when the
 * launcher exits first it kills Chrome's whole tree and removes the profile, then leaves.
 *
 * Why: a launcher that is force-killed (a thread ending, `taskkill /F` on one pid, a stopped
 * background job) runs none of its exit handlers, and Windows has no job object here that would
 * end the children with it. At 23:00 UTC on 2026-11-08 two uncapped jg-drive Chromes from 12:30 and
 * 22:10 were still drawing frames for launchers that had been dead for hours. The stray-browser
 * sweep reaps such a Chrome only when the next capture starts on the PC; this ends it within
 * {@link POLL_MS}. It imports nothing heavy on purpose: one starts per browser launch.
 */

export const POLL_MS = 500;

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Kill `pid` and everything under it; waits up to `waitMs` for the tree to be gone. */
export function killTree(pid: number, waitMs = 10_000): boolean {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true, timeout: 15_000 });
  } else {
    for (const target of [-pid, pid]) {
      try {
        process.kill(target, "SIGKILL");
      } catch {
        /* no such group or process */
      }
    }
  }
  const deadline = Date.now() + waitMs;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  while (alive(pid) && Date.now() < deadline) Atomics.wait(pause, 0, 0, 100);
  return !alive(pid);
}

export interface WatchOutcome {
  /** Why the watchdog stopped: Chrome left on its own, or the launcher died and Chrome was ended. */
  reason: "chrome exited" | "launcher died";
  chromeEnded: boolean;
}

/** Watch until one of the two processes is gone; `isAlive` and `kill` are replaceable for tests. */
export async function watch(
  launcherPid: number,
  chromePid: number,
  userDataDir: string,
  options: { pollMs?: number; isAlive?: (pid: number) => boolean; kill?: (pid: number) => boolean; remove?: (dir: string) => void } = {},
): Promise<WatchOutcome> {
  const pollMs = options.pollMs ?? POLL_MS;
  const isAlive = options.isAlive ?? alive;
  const kill = options.kill ?? killTree;
  const remove = options.remove ?? ((dir: string) => removeDirSync(dir));
  for (;;) {
    if (!isAlive(chromePid)) return { reason: "chrome exited", chromeEnded: true };
    if (!isAlive(launcherPid)) {
      const chromeEnded = kill(chromePid);
      if (chromeEnded) {
        try {
          remove(userDataDir);
        } catch {
          /* a helper still holds a file; the stale sweep reaches it */
        }
      }
      return { reason: "launcher died", chromeEnded };
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

if (import.meta.main) {
  const [launcher, chrome, userDataDir] = process.argv.slice(2);
  const launcherPid = Number(launcher);
  const chromePid = Number(chrome);
  if (!Number.isInteger(launcherPid) || !Number.isInteger(chromePid) || userDataDir === undefined) {
    console.error("usage: bun scripts/chrome-watchdog.ts <launcher pid> <chrome pid> <user-data-dir>");
    process.exit(2);
  }
  const outcome = await watch(launcherPid, chromePid, userDataDir);
  process.exit(outcome.reason === "chrome exited" || outcome.chromeEnded ? 0 : 1);
}

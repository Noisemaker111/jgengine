import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

/** Where each watchdog that had to act appends one line, so a Chrome or profile it could not end is visible. */
export function watchdogLogPath(): string {
  return join(tmpdir(), "jg-chrome-watchdog.log");
}

/**
 * Watch until one of the two processes is gone; `isAlive`, `kill`, `remove` and `log` are
 * replaceable for tests. The launcher is checked first: once it is gone nobody else will clean up,
 * so the profile is removed whether this ended Chrome or Chrome had already died with it.
 */
export async function watch(
  launcherPid: number,
  chromePid: number,
  userDataDir: string,
  options: { pollMs?: number; isAlive?: (pid: number) => boolean; kill?: (pid: number) => boolean; remove?: (dir: string) => void; log?: (line: string) => void } = {},
): Promise<WatchOutcome> {
  const pollMs = options.pollMs ?? POLL_MS;
  const isAlive = options.isAlive ?? alive;
  const kill = options.kill ?? killTree;
  const remove = options.remove ?? ((dir: string) => removeDirSync(dir));
  const log = options.log ?? ((line: string) => {
    try {
      appendFileSync(watchdogLogPath(), `${new Date().toISOString()} ${line}\n`);
    } catch {
      /* nowhere left to say it */
    }
  });
  for (;;) {
    if (!isAlive(launcherPid)) {
      const startedAt = Date.now();
      const chromeEnded = isAlive(chromePid) ? kill(chromePid) : true;
      let removed = false;
      if (chromeEnded) {
        try {
          remove(userDataDir);
          removed = true;
        } catch (error) {
          log(`degraded: launcher ${launcherPid} died; Chrome ${chromePid} ended but ${userDataDir} could not be removed (${error instanceof Error ? error.message : String(error)}); the capture sweep removes it later`);
        }
      } else {
        log(`degraded: launcher ${launcherPid} died and Chrome ${chromePid} survived the kill; ${userDataDir} kept`);
      }
      if (removed) log(`launcher ${launcherPid} died; ended Chrome ${chromePid} and removed ${userDataDir} in ${Date.now() - startedAt} ms`);
      return { reason: "launcher died", chromeEnded };
    }
    // The launcher is alive and owns the cleanup of a Chrome that exited on its own.
    if (!isAlive(chromePid)) return { reason: "chrome exited", chromeEnded: true };
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

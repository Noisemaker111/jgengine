import os from "node:os";

/**
 * Where a browser run sits against Jon's own work on the PC. `bun run perf`, `drive` and `shoot`
 * drop themselves to below-normal priority, so the game, editor and chat in front of him keep their
 * cores; on Windows a child inherits its parent's priority class, so the headless Chrome and Vite
 * they start follow. The one exception is the Chrome a perf mode measures: a frame time taken at
 * below-normal priority also measures whatever outranks it, so those sessions are put back to
 * normal (the table in `scripts/perf.ts` says which) and the record says what it ran at.
 *
 * Why: on 2026-11-08 the PC sat at 95-100% CPU, 4.5-6 cores of it headless Chrome from three
 * worktrees' perf runs, and Jon could not play.
 *
 * verify:fast, lane:close, check and test stay at normal priority. Tried below normal on 2026-11-09:
 * under the same load land-commit.test.ts passed twice at normal and failed 9 of 20 tests at below
 * normal, and four landings in a row went red on starved tests (timeouts, git calls returning
 * nothing), so the gate stopped meaning anything. Their load is bun, which was not the problem.
 */

export type PriorityLabel = "low" | "below-normal" | "normal" | "above-normal" | "high" | "realtime";

const { PRIORITY_BELOW_NORMAL, PRIORITY_NORMAL } = os.constants.priority;

/** The name for an `os.getPriority` value (Node's cross-platform scale: 19 low … -20 realtime). */
export function priorityLabel(priority: number): PriorityLabel {
  if (priority >= 19) return "low";
  if (priority >= 10) return "below-normal";
  if (priority >= 0) return "normal";
  if (priority >= -7) return "above-normal";
  if (priority >= -14) return "high";
  return "realtime";
}

/** This process's priority, or a process's by pid; "normal" when the platform cannot say. */
export function currentPriority(pid = 0): PriorityLabel {
  try {
    return priorityLabel(os.getPriority(pid));
  } catch {
    return "normal";
  }
}

/**
 * Drop this process to below-normal priority unless it already runs lower. Children started after
 * this inherit it. Returns the priority the process runs at afterwards.
 */
export function stayOutOfTheWay(): PriorityLabel {
  try {
    if (os.getPriority() < PRIORITY_BELOW_NORMAL) os.setPriority(PRIORITY_BELOW_NORMAL);
  } catch (error) {
    console.error(`degraded: could not lower this process's priority (${error instanceof Error ? error.message : String(error)})`);
  }
  return currentPriority();
}

/** Put another process (a browser started outside this one's tree) below normal, as {@link stayOutOfTheWay} does for this one. */
export function lowerToBelowNormal(pid: number): PriorityLabel {
  try {
    if (os.getPriority(pid) < PRIORITY_BELOW_NORMAL) os.setPriority(pid, PRIORITY_BELOW_NORMAL);
  } catch (error) {
    console.error(`degraded: could not lower pid ${pid}'s priority (${error instanceof Error ? error.message : String(error)})`);
  }
  return currentPriority(pid);
}

/**
 * Put a measured process back to normal priority, so its frame times are its own and not the
 * machine's. A below-normal parent may raise a child to normal without privilege; anything above
 * normal would need one and is never asked for.
 */
export function restoreNormalPriority(pid: number | undefined): PriorityLabel {
  if (pid === undefined) return "normal";
  try {
    if (os.getPriority(pid) > PRIORITY_NORMAL) os.setPriority(pid, PRIORITY_NORMAL);
  } catch (error) {
    console.error(`degraded: could not set pid ${pid} to normal priority (${error instanceof Error ? error.message : String(error)}); its numbers were taken at ${currentPriority(pid)}`);
  }
  return currentPriority(pid);
}

import { scanGameLines } from "./gameSourceScan";
import type { RatchetFinding } from "./ratchet";

/**
 * #1579: module-level mutable state is process-global. Two `GameContext`s in one process — a server
 * host running two sessions, split-screen, a test suite — share it, so a per-run timer or a
 * per-player selection silently bleeds across them. `defineStore`/`perContext` own this state.
 */
export function findModuleGlobals(root: string): RatchetFinding[] {
  return scanGameLines(root, (line, rel, lineNumber) => {
    const match = /^(?:export )?let (\w+)/.exec(line);
    if (match === null) return null;
    const name = match[1]!;
    return { key: `${rel}#${name}`, where: `${rel}:${lineNumber}` };
  }).sort((a, b) => a.key.localeCompare(b.key));
}

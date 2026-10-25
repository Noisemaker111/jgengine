import { moduleGlobalName } from "../packages/jgengine/src/gameShape";
import { scanGameLines } from "./gameSourceScan";
import type { RatchetFinding } from "./ratchet";

/**
 * #1579: module-level mutable state is process-global. Two `GameContext`s in one process — a server
 * host running two sessions, split-screen, a test suite — share it, so a per-run timer or a
 * per-player selection silently bleeds across them. `defineStore`/`perContext` own this state.
 */
export function findModuleGlobals(root: string, games?: readonly string[]): RatchetFinding[] {
  return scanGameLines(root, (line, rel, lineNumber) => {
    const name = moduleGlobalName(line);
    if (name === null) return null;
    return { key: `${rel}#${name}`, where: `${rel}:${lineNumber}` };
  }, games).sort((a, b) => a.key.localeCompare(b.key));
}

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * #1579: module-level mutable state is process-global. Two `GameContext`s in one process — a server
 * host running two sessions, split-screen, a test suite — share it, so a per-run timer or a
 * per-player selection silently bleeds across them. `defineStore`/`perContext` own this state.
 */

export interface ModuleGlobal {
  key: string;
  declaration: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(path, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/** Every module-level `let` in a game's `src` tree — the declarations a second context would share. */
export function findModuleGlobals(root: string): ModuleGlobal[] {
  const gamesDir = join(root, "Games");
  const found: ModuleGlobal[] = [];
  for (const game of readdirSync(gamesDir)) {
    const src = join(gamesDir, game, "src");
    let stat;
    try {
      stat = statSync(src);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    for (const file of walk(src)) {
      const source = readFileSync(file, "utf8");
      const rel = relative(root, file).replace(/\\/g, "/");
      for (const [index, line] of source.split("\n").entries()) {
        const match = /^(?:export )?let (\w+)/.exec(line);
        if (match === null) continue;
        const name = match[1]!;
        found.push({ key: `${rel}#${name}`, declaration: `${rel}:${index + 1}` });
      }
    }
  }
  return found.sort((a, b) => a.key.localeCompare(b.key));
}

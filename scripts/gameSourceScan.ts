import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { isGameSourceFile } from "../packages/jgengine/src/gameShape";

/** Every non-test `.ts`/`.tsx` under each game's `src`, as repo-relative paths with their source.
 * Pass `games` to scan only those (the reference set); omitted scans every game folder. */
export function eachGameSource(root: string, games?: readonly string[]): { rel: string; source: string }[] {
  const gamesDir = join(root, "games");
  const files: { rel: string; source: string }[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry === "node_modules" || entry === "dist") continue;
        walk(path);
      } else if (isGameSourceFile(entry)) {
        files.push({ rel: relative(root, path).replace(/\\/g, "/"), source: readFileSync(path, "utf8") });
      }
    }
  };

  let folders: string[];
  try {
    folders = readdirSync(gamesDir);
  } catch {
    return [];
  }
  for (const game of folders) {
    if (games !== undefined && !games.includes(game)) continue;
    // Only real games have a src/index.tsx barrel (the dev harness entry). This excludes
    // helper packages like `studios` (src/index.ts) and design-only folders like `vaultbreak`.
    if (!existsSync(join(gamesDir, game, "src/index.tsx"))) continue;
    const src = join(gamesDir, game, "src");
    try {
      if (!statSync(src).isDirectory()) continue;
    } catch {
      continue;
    }
    walk(src);
  }
  return files;
}


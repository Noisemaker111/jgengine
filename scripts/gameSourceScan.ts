import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Every non-test `.ts`/`.tsx` under each game's `src`, as repo-relative paths with their source.
 * Games now live in Noisemaker111/JGengine-games and are cloned at build time into ephemeral ./Games.
 * When the directory is absent (fresh engine checkout with no clone), return no sources rather than throwing. */
export function eachGameSource(root: string): { rel: string; source: string }[] {
  const gamesDir = join(root, "Games");
  const files: { rel: string; source: string }[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry === "node_modules" || entry === "dist") continue;
        walk(path);
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        files.push({ rel: relative(root, path).replace(/\\/g, "/"), source: readFileSync(path, "utf8") });
      }
    }
  };

  let games: string[];
  try {
    games = readdirSync(gamesDir);
  } catch {
    return [];
  }
  for (const game of games) {
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

/** Scans every game source line by line, collecting whatever `match` returns. */
export function scanGameLines<T>(root: string, match: (line: string, rel: string, lineNumber: number) => T | null): T[] {
  const found: T[] = [];
  for (const { rel, source } of eachGameSource(root)) {
    for (const [index, line] of source.split("\n").entries()) {
      const hit = match(line, rel, index + 1);
      if (hit !== null) found.push(hit);
    }
  }
  return found;
}

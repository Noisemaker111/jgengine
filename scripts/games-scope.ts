import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The games this engine builds, read from the budgets the perf gate measures (`scripts/perf-budget.json`).
 * The Games/ clone is the whole JGengine-games repo at the pinned SHA, so it can hold other games that
 * repo is working on; the gates scan only the reference set and name the rest instead of failing on
 * another checkout's work. A tree without the budget file (a test fixture) is not this repo, so it keeps
 * the old behaviour and scans every folder with a `src`.
 */
export function referenceGames(root: string): string[] {
  const budget = join(root, "scripts", "perf-budget.json");
  if (!existsSync(budget)) return folders(root, (name) => existsSync(join(root, "Games", name, "src")));
  return Object.keys(JSON.parse(readFileSync(budget, "utf8")) as Record<string, unknown>).sort();
}

function folders(root: string, keep: (name: string) => boolean): string[] {
  const gamesDir = join(root, "Games");
  if (!existsSync(gamesDir)) return [];
  return readdirSync(gamesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && keep(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/** Games under Games/ that are not reference games, in name order — folders with a game's own entry. */
export function ignoredGames(root: string, games: readonly string[] = referenceGames(root)): string[] {
  return folders(root, (name) => {
    const dir = join(root, "Games", name);
    return (
      existsSync(join(dir, "index.html")) ||
      existsSync(join(dir, "src/index.tsx")) ||
      existsSync(join(dir, "src/game.config.ts"))
    );
  }).filter((game) => !games.includes(game));
}

/** The warning line for a gate that skipped games, or null when it skipped none. */
export function ignoredGamesWarning(gate: string, ignored: readonly string[]): string | null {
  if (ignored.length === 0) return null;
  return (
    `${gate}: ignoring ${ignored.length} game(s) this repo does not build — ` +
    `${ignored.join(", ")} (reference games: scripts/perf-budget.json)`
  );
}

/** One warning line naming every game a gate skipped, so an unexpected clone stays visible. */
export function warnIgnoredGames(gate: string, ignored: readonly string[]): void {
  const line = ignoredGamesWarning(gate, ignored);
  if (line !== null) console.warn(line);
}

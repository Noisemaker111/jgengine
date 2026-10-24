import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Structural proof that a Games-reading gate still asks which commit it measures.
 * The gates cannot be imported (their top level runs the gate), so the shared check
 * reads the source: a gate that drops the guard, or that goes back to reporting a
 * missing clone as "clean", fails here instead of quietly measuring an old tree.
 */
export function readsPinnedGames(gate: string, file = `${gate}.ts`): void {
  const source = readFileSync(join(import.meta.dir, "..", file), "utf8");
  if (!source.includes(`requireGamesAtPin("${gate}"`)) {
    throw new Error(`${file} no longer calls requireGamesAtPin("${gate}") - it would measure whatever Games/ holds`);
  }
  for (const silent of ["clean - no Games/ checkout", 'clean — no Games/ checkout', 'process.env.CI === "true" &&']) {
    if (source.includes(silent)) throw new Error(`${file} still treats a missing or unpinned Games/ checkout as a pass (${silent})`);
  }
}

/** The gates that read `Games/`, each with the name it must print. */
export const GAMES_GATES = [
  "check-art-direction",
  "check-content-gate",
  "check-game-determinism",
  "check-game-feel",
  "check-game-front-end",
  "check-game-shape",
  "check-module-globals",
  "games:check",
] as const;

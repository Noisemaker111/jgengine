import { fileURLToPath } from "node:url";

import { findRandomnessLeaks } from "./gameDeterminism";
import { ignoredGames, referenceGames, requireGamesAtPin, warnIgnoredGames } from "./games-scope";
import { runRatchet } from "./ratchet";

const root = fileURLToPath(new URL("..", import.meta.url));
requireGamesAtPin("check-game-determinism", root);

const games = referenceGames(root);
warnIgnoredGames("check-game-determinism", ignoredGames(root, games));
runRatchet(
  {
    name: "check-game-determinism",
    baselineRel: "scripts/game-determinism-baseline.json",
    scan: (scanRoot) => findRandomnessLeaks(scanRoot, games),
    guidance:
      "`Math.random` makes a run unreproducible — no replay, no lockstep, no rollback, and a test\n" +
      "that cannot pin the outcome. Every game context carries `ctx.rng`, the per-world seeded\n" +
      "stream; use it on any path that touches simulation. For a helper called outside a context,\n" +
      "take `rng: () => number` as a parameter and let the caller pass `ctx.rng`.\n" +
      "See AGENTS.md — Scale by default.",
  },
  fileURLToPath(new URL("..", import.meta.url)),
  process.argv,
);

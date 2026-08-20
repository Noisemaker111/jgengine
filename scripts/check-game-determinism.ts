import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { findRandomnessLeaks } from "./gameDeterminism";
import { runRatchet } from "./ratchet";

const root = fileURLToPath(new URL("..", import.meta.url));
if (!existsSync(join(root, "Games"))) {
  console.log("check-game-determinism: clean — no Games/ checkout (games live in Noisemaker111/JGengine-games)");
  process.exit(0);
}

runRatchet(
  {
    name: "check-game-determinism",
    baselineRel: "scripts/game-determinism-baseline.json",
    scan: findRandomnessLeaks,
    guidance:
      "`Math.random` makes a run unreproducible — no replay, no lockstep, no rollback, and a test\n" +
      "that cannot pin the outcome. Every game context carries `ctx.rng`, the per-world seeded\n" +
      "stream; use it on any path that touches simulation. For a helper called outside a context,\n" +
      "take `rng: () => number` as a parameter and let the caller pass `ctx.rng`.\n" +
      "See CLAUDE.md — Scale by default.",
  },
  fileURLToPath(new URL("..", import.meta.url)),
  process.argv,
);

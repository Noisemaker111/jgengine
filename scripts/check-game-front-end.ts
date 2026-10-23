import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { findFrontEndGaps } from "./gameFrontEnd";
import { ignoredGames, referenceGames, warnIgnoredGames } from "./games-scope";
import { runRatchet } from "./ratchet";

const root = fileURLToPath(new URL("..", import.meta.url));
if (!existsSync(join(root, "Games"))) {
  if (process.env.CI === "true") {
    console.error("check-game-front-end: Games/ checkout is required in CI — run bun run games:clone first");
    process.exit(1);
  }
  console.log("check-game-front-end: clean — no Games/ checkout (games live in Noisemaker111/JGengine-games)");
  process.exit(0);
}

const games = referenceGames(root);
warnIgnoredGames("check-game-front-end", ignoredGames(root, games));
runRatchet(
  {
    name: "check-game-front-end",
    baselineRel: "scripts/game-front-end-baseline.json",
    scan: (scanRoot) => findFrontEndGaps(scanRoot, games),
    guidance:
      "Every game owns a settings surface and reachable in-game credits — see AGENTS.md, and the\n" +
      "`jgengine-ui` skill for the parts. Neither is expensive: `Games/wreckway` routes both from its\n" +
      "title screen with `useMenuRouter`, and its credits are generated from the asset packs it ships.",
  },
  fileURLToPath(new URL("..", import.meta.url)),
  process.argv,
);

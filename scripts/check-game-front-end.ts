import { fileURLToPath } from "node:url";

import { findFrontEndGaps } from "./gameFrontEnd";
import { runRatchet } from "./ratchet";

runRatchet(
  {
    name: "check-game-front-end",
    baselineRel: "scripts/game-front-end-baseline.json",
    scan: findFrontEndGaps,
    guidance:
      "Every game owns a settings surface and reachable in-game credits — see CLAUDE.md, and the\n" +
      "`jgengine-ui` skill for the parts. Neither is expensive: `Games/wreckway` routes both from its\n" +
      "title screen with `useMenuRouter`, and its credits are generated from the asset packs it ships.",
  },
  fileURLToPath(new URL("..", import.meta.url)),
  process.argv,
);

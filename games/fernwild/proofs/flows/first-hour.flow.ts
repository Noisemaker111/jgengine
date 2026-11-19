import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

import { firstHour, firstLoop } from "./from-zero.flow";

/** About 19 minutes of a new game, keys and mouse only: the first loop, then the hut, the Phiomia, narcotics and the club. */
export default defineFlow(game, {
  async run(f) {
    await firstHour(f, await firstLoop(f));
  },
});

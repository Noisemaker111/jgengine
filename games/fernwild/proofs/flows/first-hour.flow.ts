import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

import { firstHour, firstLoop } from "./from-zero.flow";

export default defineFlow(game, {
  async run(f) {
    await firstHour(f, await firstLoop(f));
  },
});

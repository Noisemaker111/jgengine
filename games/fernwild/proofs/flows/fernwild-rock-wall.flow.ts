import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** Keep walking at the nearest rock from spawn: the survivor stops at its face instead of walking through it. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.creatures > 0 && p.rockDist > 0, { timeoutMs: 60000 });
    for (let step = 0; step < 16; step += 1) {
      await f.heading((await f.probe()).rockYaw);
      await f.hold("KeyW", { ms: 700 });
    }
    await f.heading((await f.probe()).rockYaw);
    await f.hold("KeyW", { ms: 400 });
    await f.wait(500);
    await f.shot("rock-wall");
    await f.expect((p) => p.rockDist > 0.6, "the rock stopped the survivor at its face");
  },
});

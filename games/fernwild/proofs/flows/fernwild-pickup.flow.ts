import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** First person at spawn: punch the nearest tree, then pick up stones, and shoot what the HUD says about each. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    await f.press("KeyV");
    await f.command("cheat", { clock: 1800 });
    await f.heading((await f.probe()).treeYaw);
    await f.hold("KeyW", { until: (p) => p.treeDist <= 1.4, timeoutMs: 10000 });
    await f.heading((await f.probe()).treeYaw);
    await f.hold("mouse0", { ms: 2600 });
    await f.expect((p) => p.thatch > 0, "punching the tree gave thatch");
    await f.shot("pickup-punch");
    // The path now points at loose stones: walk up, look at them and pick them up.
    await f.heading((await f.probe()).pointYaw);
    await f.hold("KeyW", { until: (p) => p.pointDist >= 0 && p.pointDist <= 1.2, timeoutMs: 10000 });
    await f.heading((await f.probe()).pointYaw);
    await f.press("KeyE");
    await f.expect((p) => p.stone > 0, "E picked up a stone");
    await f.wait(400);
    await f.shot("pickup-stones");
  },
});

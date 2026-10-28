import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** ARK's inventory centre pane: a cloth set in the bag, then worn in its five slots around the survivor. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    await f.command("cheat", { give: { cloth_hat: 1, cloth_shirt: 1, cloth_pants: 1, cloth_gloves: 1, cloth_boots: 1, thatch: 30, fiber: 40, stone: 12, stone_pick: 1 } });
    await f.press("KeyI");
    await f.wait(1500);
    await f.shot("gear-in-bag");
    await f.command("cheat", { wear: ["cloth_hat", "cloth_shirt", "cloth_pants", "cloth_gloves", "cloth_boots"] });
    await f.wait(1200);
    await f.shot("gear-worn");
  },
});

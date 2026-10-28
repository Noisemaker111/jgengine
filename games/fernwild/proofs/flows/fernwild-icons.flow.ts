import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** A stocked survivor: the hotbar and the inventory draw game-icons.net item icons. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    await f.command("cheat", {
      give: { stone_pick: 1, stone_hatchet: 1, spear: 1, torch: 1, thatch: 40, wood: 20, stone: 30, flint: 12, fiber: 50, hide: 6, mejoberry: 15, raw_meat: 4, cooked_meat: 3, narcotic: 5, waterskin: 1, campfire: 1, thatch_wall: 4, cloth_shirt: 1 },
      toHotbar: ["stone_pick", "stone_hatchet", "spear", "torch", "mejoberry", "cooked_meat"],
    });
    await f.wait(800);
    await f.shot("fernwild-icons-hotbar");
    await f.press("KeyI");
    await f.wait(800);
    await f.shot("fernwild-icons-inventory");
  },
});

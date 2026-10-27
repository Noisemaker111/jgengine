import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.health > 0, { timeoutMs: 60000 });
    await f.expect((p) => p.health === 100 && p.level === 1, "arrival: a fresh level-1 survivor washed up on the south beach");
    // spawn on the beach, looking inland at a palm
    await f.shot("fernwild-beach");
    await f.expect((p) => p.aimStrike === 1 && p.aimPick === 1, "arrival: a palm is in punching reach and beach stones lie at your feet");
    // punch the palm: thatch and a little wood, like ARK's bare hands
    await f.hold("mouse0", { ms: 4000 });
    await f.waitFor((p) => p.thatch >= 10 && p.wood >= 1, { timeoutMs: 6000 });
    // the gather feed and float text show what the fist got
    await f.shot("fernwild-punched");
    // pick up stones by hand
    await f.press("KeyE");
    await f.waitFor((p) => p.stone >= 1, { timeoutMs: 3000 });
    // open the survivor inventory
    await f.press("KeyI");
    await f.waitFor((p) => p.screen === 1, { timeoutMs: 3000 });
    // craft a Stone Pick from 1 wood, 1 stone and 10 thatch
    await f.click("Stone Pick");
    await f.waitFor((p) => p.crafting >= 1 || p.picks >= 1, { timeoutMs: 3000 });
    // the inventory, stats and crafting queue
    await f.shot("fernwild-crafting");
    await f.waitFor((p) => p.picks >= 1, { timeoutMs: 20000, note: "arrival: the pick is made and sits in the hotbar" });
    // close the inventory
    await f.press("KeyI");
    await f.waitFor((p) => p.screen === 0, { timeoutMs: 3000 });
    // equip the Stone Pick from hotbar slot 1
    await f.press("Digit1");
    // the pick strips thatch faster than a fist
    await f.hold("mouse0", { ms: 3000 });
    await f.waitFor((p) => p.thatch >= 8, { timeoutMs: 5000 });
    // the pick in hand, the hotbar slot lit
    await f.shot("fernwild-pick");
  },
});

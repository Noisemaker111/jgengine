import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// A campfire burns fuel by the second and cooks only while it burns. Setup lights one with ten seconds of
// fuel and play queues three cooked meat (twenty seconds each): the fire goes out partway through the
// first, the cooking stops there, and one more wood starts it again from where it stopped.
export default defineProof(game, {
  proves: ["crafting.fuel"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { give: { campfire: 1, raw_meat: 3, wood: 1 }, toHotbar: ["campfire"] });
    s.press("Digit1");
    s.hold("mouse0", { until: (p) => p.fuel >= 0, ms: 80, timeoutMs: 3000 });
    s.command("cheat", { fuel: 10 });
  },
  async play(p) {
    await p.expect((r) => r.fuel > 8, "the campfire is lit with a little fuel");
    await p.act("craft", { recipeId: "cook_meat", count: 3 });
    await p.waitFor((r) => r.craftProgress > 0, { timeoutMs: 3000, note: "the meat starts cooking over the fire" });
    await p.waitFor((r) => r.fuel === 0, { timeoutMs: 15_000, note: "the fuel burns down" });
    await p.wait(500);
    const out = await p.probe();
    await p.wait(15_000);
    await p.expect((r) => r.craftProgress === out.craftProgress && r.cookedMeat === 0, `the cooking stopped at ${out.craftProgress}% when the fire went out`);
    await p.press("KeyE");
    await p.waitFor((r) => r.cookedMeat >= 1, { timeoutMs: 20_000, note: "one more wood and the first meat finishes" });
  },
});

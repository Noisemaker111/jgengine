import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Sparkpowder is ground at a Mortar and Pestle: the bare inventory can't make it, a placed one can.
export default defineProof(game, {
  proves: ["crafting.station-tiers"],
  setup(s) {
    s.command("onboarding.skip");
    s.command("cheat", { xp: 2000, give: { flint: 4, stone: 2, mortar_and_pestle: 1 }, toHotbar: ["mortar_and_pestle"] });
    // Onto open sand, clear of the palm by the spawn.
    s.hold("KeyD", { ms: 700 });
  },
  async play(p) {
    await p.act("learn", { engramId: "sparkpowder" });
    const before = await p.probe();
    await p.act("craft", { recipeId: "sparkpowder" });
    await p.wait(4000);
    await p.expect((r) => r.crafted === before.crafted, "with no mortar nearby, sparkpowder doesn't craft");
    await p.press("Digit1");
    await p.waitFor((r) => r.ghost === 1, { timeoutMs: 3000, note: "a mortar ghost" });
    await p.hold("mouse0", { until: (r) => r.structures === 1, ms: 80, timeoutMs: 3000 });
    await p.act("craft", { recipeId: "sparkpowder" });
    await p.waitFor((r) => r.crafted > before.crafted, { timeoutMs: 15_000, note: "beside a placed mortar, sparkpowder crafts" });
  },
});

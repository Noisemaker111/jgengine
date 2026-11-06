import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

export default defineProof(game, {
  proves: ["crafting.unlock-spend"],
  setup(s) {
    // A player who skips the survivor's path, so no onboarding step holds the engram list back.
    s.command("onboarding.skip");
    s.command("cheat", { xp: 2000, give: { wood: 8, flint: 2, fiber: 12 } });
  },
  async play(p) {
    const before = await p.probe();
    await p.act("learn", { engramId: "spear" });
    await p.expect((r) => r.unlocks === before.unlocks + 1, "the spear engram learned with a point");
    await p.act("craft", { recipeId: "spear" });
    await p.waitFor((r) => r.crafted > before.crafted, { timeoutMs: 15_000, note: "the spear crafted" });
  },
});

import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

export default defineProof(game, {
  proves: ["survival.food-spoils"],
  setup(s) {
    s.command("cheat", { give: { raw_meat: 1 } });
  },
  async play(p) {
    await p.waitFor((r) => r.spoiledMeat >= 1, { timeoutMs: 620_000, note: "carried raw meat spoils" });
  },
});

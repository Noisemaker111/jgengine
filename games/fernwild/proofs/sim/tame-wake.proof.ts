import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { raptorDown } from "./scenarios";

// A raptor partway tamed, five raw meat of the seven it needs at normal taming speed, with no narcotic
// to keep it under: its torpor wears off before the tame finishes, it wakes wild and the taming is gone.
export default defineProof(game, {
  proves: ["taming.wake-loses"],
  setup(s) {
    raptorDown(s, { raw_meat: 5 });
    s.command("giveCreature", { inventoryId: "inventory", slot: s.probe().foodSlot });
    s.waitFor((p) => p.tameProgress > 0, { timeoutMs: 20_000 });
    s.command("cheat", { tamingSpeed: 1 });
    s.command("closeCreature", {});
  },
  async play(p) {
    await p.expect((r) => r.aimedDown === 1 && r.tameProgress > 0, "down and partway tamed");
    await p.waitFor((r) => r.tameProgress >= 50, { timeoutMs: 400_000, note: "it eats its way past halfway" });
    await p.waitFor((r) => r.down === 0, { timeoutMs: 900_000, note: "its torpor wears off and it wakes" });
    await p.expect((r) => r.awakeProgress === 0 && r.tamed === 0, "wild again, the taming gone");
  },
});

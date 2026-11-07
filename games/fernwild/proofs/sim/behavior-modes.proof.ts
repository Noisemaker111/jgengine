import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// A tame's stance decides what it starts. Setup puts a level 30 tame raptor beside the survivor, following
// and neutral, and a wild dodo, which never attacks, a few metres off. Neutral leaves the dodo be;
// whistled aggressive, the raptor goes for it unprovoked.
export default defineProof(game, {
  proves: ["creatures.behavior-modes"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { summon: { species: "raptor", level: 30, distance: 3, tamed: true } });
    s.press("KeyT");
    s.waitFor((p) => p.tameStance === 1, { timeoutMs: 3000 });
    s.command("cheat", { summon: { species: "dodo", level: 1, distance: 7, side: 3 } });
  },
  async play(p) {
    await p.wait(6000);
    await p.expect((r) => r.tameStance === 1 && r.wildHurt === 0, "a neutral tame leaves a harmless dodo alone");
    await p.act("whistleAggressive");
    await p.expect((r) => r.tameStance === 2, "whistled aggressive");
    await p.waitFor((r) => r.wildHurt >= 1, { timeoutMs: 15_000, note: "an aggressive tame attacks the dodo unprovoked" });
  },
});

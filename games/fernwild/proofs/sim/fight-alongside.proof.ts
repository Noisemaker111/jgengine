import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// A tame turns on what attacks you, unless it is passive. Setup toughens the survivor so a raptor's bites
// cannot kill them during the wait, puts a level 30 tame raptor at their side, following and set passive,
// then a wild level 1 raptor a little way off that comes for the survivor. The survivor never swings.
export default defineProof(game, {
  proves: ["creatures.fight-alongside"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { xp: 100_000, spend: { health: 40 } });
    s.command("cheat", { summon: { species: "raptor", level: 30, distance: 3, tamed: true } });
    s.press("KeyT");
    s.command("whistlePassive");
    s.waitFor((p) => p.tameStance === 0, { timeoutMs: 3000 });
    s.command("cheat", { summon: { species: "raptor", level: 1, distance: 12 } });
  },
  async play(p) {
    await p.waitFor((r) => r.dangerDist >= 0 && r.dangerDist < 4, { timeoutMs: 15_000, note: "the wild raptor closes on the survivor" });
    await p.wait(4000);
    await p.expect((r) => r.wildHurt === 0, "a passive tame lets it bite without fighting back");
    await p.act("whistleNeutral");
    await p.waitFor((r) => r.wildHurt >= 1, { timeoutMs: 15_000, note: "whistled neutral, the tame turns on what attacks the survivor" });
  },
});

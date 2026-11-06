import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { timeTame, turnAround, twoRaptorsDown } from "./scenarios";

// Two level-30 raptors on raw meat: one left alone to eat, one clubbed while it eats. The clean tame
// keeps more taming effectiveness and so gets more bonus levels.
export default defineProof(game, {
  proves: ["taming.effectiveness"],
  setup(s) {
    // Two stacks of raw meat, one for each.
    twoRaptorsDown(s, { raw_meat: 70, wooden_club: 1 }, 30);
    s.command("cheat", { toHotbar: ["wooden_club"] });
  },
  async play(p) {
    const clean = await timeTame(p, (r) => r.rawMeatSlot, 0);
    await turnAround(p);
    await p.hold("KeyE", { until: (r) => r.screen === 1, timeoutMs: 3000 });
    await p.act("giveCreature", { inventoryId: "inventory", slot: (await p.probe()).rawMeatSlot });
    await p.act("closeCreature", {});
    await p.press("Digit1");
    await p.hold("mouse0", { ms: 2000 });
    const hit = await p.waitFor((r) => r.tamed > 1, { timeoutMs: 90_000, note: "the clubbed one tamed too" });
    await p.expect(() => hit.lastTameEffectiveness < clean.effectiveness, `clean ${clean.effectiveness}%, clubbed ${hit.lastTameEffectiveness}%`);
    await p.expect(() => clean.bonus > hit.lastTameBonus, `clean +${clean.bonus} levels, clubbed +${hit.lastTameBonus}`);
  },
});

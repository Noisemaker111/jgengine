import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { raptorDown } from "./scenarios";

/** The fastest any creature's torpor wears off, a second (ARK: 0.3 at level 1, 0.5 at level 30). */
const FASTEST_DRAIN = 0.5;

// A raptor partway tamed, five raw meat of the seven it needs at normal taming speed. Play gives it one
// last narcotic and then nothing: it stays out while that torpor and what it already had wear off, only
// then wakes wild, and the taming is gone.
export default defineProof(game, {
  proves: ["taming.wake-loses"],
  setup(s) {
    raptorDown(s, { raw_meat: 5, narcotic: 1 });
    s.command("giveCreature", { inventoryId: "inventory", slot: s.probe().foodSlot });
    const narcotic = s.ctx.player.inventory.state("inventory").slots.findIndex((stack) => stack?.itemId === "narcotic");
    s.command("giveCreature", { inventoryId: "inventory", slot: narcotic });
    s.waitFor((p) => p.tameProgress > 0, { timeoutMs: 20_000 });
    s.command("cheat", { tamingSpeed: 1 });
    // Let the knockout's full torpor wear down until the narcotic has room to show.
    const full = s.probe().aimedTorpor;
    s.waitFor((p) => p.aimedTorpor < full - 50, { timeoutMs: 300_000 });
  },
  async play(p) {
    await p.expect((r) => r.aimedDown === 1 && r.tameProgress > 0, "down and partway tamed");
    const start = await p.probe();
    await p.act("feedNarcotic", { itemId: "narcotic" });
    await p.act("closeCreature", {});
    // Everything it has to wear off: the torpor it holds and the narcotic still taking effect.
    const earliest = start.clock + (start.aimedTorpor + 40) / FASTEST_DRAIN;
    await p.waitFor((r) => r.tameProgress >= 50, { timeoutMs: 400_000, note: "it eats its way past halfway" });
    await p.waitFor((r) => r.down === 0, { timeoutMs: 1_200_000, note: "its torpor wears off and it wakes" });
    await p.expect((r) => r.clock >= earliest, `it stayed out until its torpor was spent (not before ${Math.round(earliest)} s)`);
    await p.expect((r) => r.awakeProgress === 0 && r.tamed === 0, "wild again, the taming gone");
  },
});

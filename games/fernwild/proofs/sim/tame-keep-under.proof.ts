import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { raptorDown } from "./scenarios";

export default defineProof(game, {
  proves: ["taming.keep-under"],
  setup(s) {
    raptorDown(s, { narcotic: 5 });
    // Narcotic into the downed raptor's inventory, where the feed button takes it from.
    const slot = s.ctx.player.inventory.state("inventory").slots.findIndex((stack) => stack?.itemId === "narcotic");
    s.command("giveCreature", { inventoryId: "inventory", slot });
    // Knocked out it sits at full torpor; let it wear off until a dose has room to show.
    const full = s.probe().aimedTorpor;
    s.waitFor((p) => p.aimedTorpor < full - 25, { timeoutMs: 120_000 });
  },
  async play(p) {
    const before = (await p.probe()).aimedTorpor;
    await p.act("feedNarcotic", { itemId: "narcotic" });
    await p.waitFor((r) => r.aimedTorpor > before + 5, { timeoutMs: 20_000, note: "the narcotic raises its torpor" });
  },
});

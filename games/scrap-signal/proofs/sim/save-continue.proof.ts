import { defineProof } from "@jgengine/core/suite/suiteProof";
import { seededRng } from "@jgengine/core/random/rng";

import { game } from "../../src/game.config";
import { rollGun } from "../../src/game/handroll";
import { SCRAP_SLOTS } from "../../src/game/scrapSlots";

let junk = "";

// The player salvages a weapon at the bench for cash, saves to the fridge and quits. Continue from
// the title puts the same tinkerer back with the same wallet.
export default defineProof(game, {
  proves: ["save.continue"],
  setup(s) {
    s.waitFor((p) => p.health > 0, { timeoutMs: 10_000 });
    const gun = rollGun(seededRng("suite-save"), 8, { family: "shotgun", rarity: "epic" });
    junk = gun.id;
    s.ctx.player.inventory.put("hotbar", gun.id, 1, { slot: 0 });
  },
  async play(p) {
    const before = await p.probe();
    await p.act("workbench.salvage", { itemId: junk });
    const earned = await p.expect((r) => r.cash > before.cash, "cash earned at the bench");
    await p.act("run.save", { slot: SCRAP_SLOTS[0].id });
    await p.wait(300);
    await p.restart("title");
    await p.expect((r) => r.phase === 0, "a new session opens at the title");
    await p.act("run.continue", { slot: SCRAP_SLOTS[0].id });
    await p.waitFor((r) => r.phase === 1, { timeoutMs: 5000, note: "Continue resumes the run" });
    await p.expect((r) => r.cash === earned.cash && r.level === earned.level, "the same wallet and level");
  },
});

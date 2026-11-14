import { defineProof } from "@jgengine/core/suite/suiteProof";
import { seededRng } from "@jgengine/core/random/rng";

import { game } from "../../src/game.config";
import { rollGun } from "../../src/game/handroll";

let unwanted = "";

export default defineProof(game, {
  proves: ["loot.vendor-or-salvage"],
  setup(s) {
    s.waitFor((p) => p.health > 0, { timeoutMs: 10_000 });
    // A Like New nail gun the player does not want, carried in the first slot.
    const gun = rollGun(seededRng("suite-salvage"), 6, { family: "smg", rarity: "rare" });
    unwanted = gun.id;
    s.ctx.player.inventory.put("hotbar", gun.id, 1, { slot: 0 });
  },
  async play(p) {
    const before = await p.probe();
    await p.expect((r) => r.gunsHeld === 1, "the unwanted weapon is carried");
    await p.act("workbench.salvage", { itemId: unwanted });
    await p.expect((r) => r.gunsHeld === 0 && r.cash > before.cash && r.cores > before.cores, "salvaged into cash and a spare part");
  },
});

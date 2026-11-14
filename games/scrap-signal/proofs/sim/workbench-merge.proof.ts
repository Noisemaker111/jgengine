import { defineProof } from "@jgengine/core/suite/suiteProof";
import { seededRng } from "@jgengine/core/random/rng";

import { game } from "../../src/game.config";
import { earn } from "../../src/game/cash";
import { noteEquipped } from "../../src/game/feel";
import { rollGun } from "../../src/game/handroll";
import { award, unlock } from "../../src/game/progression/unlocks";
import { session } from "../../src/game/session";

const picked = { body: "", mod: "" };

export default defineProof(game, {
  proves: ["loot.gear-upgrade"],
  setup(s) {
    s.waitFor((p) => p.health > 0, { timeoutMs: 10_000 });
    award(s.ctx, unlock.slot(1));
    award(s.ctx, unlock.slot(2));
    // A Used rubber-banded staple gun in hand, and a Used nail gun with a cinder block strapped on.
    const body = rollGun(seededRng("suite-merge-body"), 5, { family: "pistol", rarity: "uncommon", maker: "Rubber Bands" });
    const mod = rollGun(seededRng("suite-merge-mod"), 5, { family: "smg", rarity: "uncommon", maker: "Cinder Block" });
    picked.body = body.id;
    picked.mod = mod.id;
    s.ctx.player.inventory.put("hotbar", body.id, 1, { slot: 0 });
    s.ctx.player.inventory.put("hotbar", mod.id, 1, { slot: 1 });
    session.selectSlot(s.ctx, 0);
    noteEquipped(body.id);
    earn(s.ctx, "cash", 500, "quest-reward");
    earn(s.ctx, "cores", 2, "quest-reward");
  },
  async play(p) {
    const before = await p.probe();
    await p.act("workbench.merge", { bodyId: picked.body, modId: picked.mod });
    // Two Used make a Like New, with the cinder block's weight: the staple gun in hand now hits harder.
    await p.expect((r) => r.gunsHeld === 1 && r.heldSlot === 0 && r.heldPower > before.heldPower, "the merged weapon in hand hits harder");
  },
});

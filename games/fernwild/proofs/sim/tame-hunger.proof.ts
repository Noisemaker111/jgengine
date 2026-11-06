import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Two tame raptors, both nearly out of food. Play puts raw meat in the one ahead's inventory: it eats
// back up from it, while the other, given nothing, starves to death.
export default defineProof(game, {
  proves: ["creatures.feed-starve"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { destroyWild: true, give: { raw_meat: 20 } });
    // Off the spawn point, the way the taming scenarios stand, so the one summoned ahead is in the crosshair.
    s.hold("KeyD", { until: (p) => p.acrossSpawn > 3, ms: 200, timeoutMs: 4000 });
    s.hold("KeyW", { ms: 250 });
    s.command("cheat", { summon: { species: "raptor", level: 10, distance: 2.5, tamed: true } });
    s.command("cheat", { summon: { species: "raptor", level: 10, distance: 2.5, side: 8, tamed: true } });
    s.command("cheat", { tameFood: 0.02 });
    s.wait(700);
    s.waitFor((p) => p.aimedFood >= 0 && p.aimedFood <= 2, { timeoutMs: 5000 });
  },
  async play(p) {
    await p.expect((r) => r.tamed === 2, "two tames, both nearly starving");
    await p.hold("KeyE", { until: (r) => r.screen === 1, timeoutMs: 3000 });
    const slot = (await p.probe()).rawMeatSlot;
    await p.act("giveCreature", { inventoryId: "inventory", slot });
    await p.act("closeCreature", {});
    await p.waitFor((r) => r.aimedFood >= 50, { timeoutMs: 20_000, note: "the fed one eats from its inventory" });
    await p.waitFor((r) => r.tamed === 1, { timeoutMs: 400_000, note: "the unfed one starves to death" });
    await p.expect((r) => r.aimedFood >= 50 && r.aimedHealth > 0, "the fed one is alive and fed");
  },
});

import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// A hundred stone weighs 50 in the survivor's bag. Moved into a tamed Doedicurus, ARK's stone carrier, the
// same stack weighs a quarter of that on it.
export default defineProof(game, {
  proves: ["creatures.work.lighter-loads"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { give: { stone: 100 }, summon: { species: "doedicurus", level: 1, distance: 2.6, tamed: true } });
    s.wait(300);
  },
  async play(p) {
    const before = await p.probe();
    await p.hold("KeyE", { until: (r) => r.screen === 1, timeoutMs: 3000 });
    await p.act("giveCreature", { inventoryId: "inventory", slot: before.stoneSlot });
    await p.waitFor((r) => r.tameStone === 100, { timeoutMs: 2000, note: "the stack is on the Doedicurus" });
    const moved = await p.probe();
    const inBag = before.weight - moved.weight;
    await p.expect(() => inBag >= 49 && moved.tameWeight <= inBag / 2, `100 stone weighed ${inBag} in the bag and ${moved.tameWeight} on the Doedicurus`);
  },
});

import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

type Reading = { x: number; z: number };
const moved = (from: Reading, to: Reading) => Math.hypot(to.x - from.x, to.z - from.z);

// A tame carries what the survivor cannot. Setup loads the bag past the survivor's limit beside a tame
// Phiomia. Play cannot move, hands the Phiomia a stack of stone, and walks off with the rest.
export default defineProof(game, {
  proves: ["creatures.work.haul"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { summon: { species: "phiomia", level: 10, distance: 3, tamed: true } });
    s.command("cheat", { give: { stone: 210 } });
  },
  async play(p) {
    await p.expect((r) => r.weight >= r.weightMax, "the bag weighs more than the survivor can carry");
    // A second to settle from setup before measuring.
    await p.wait(1000);
    const stuck = await p.probe();
    await p.hold("KeyS", { ms: 1000 });
    await p.expect((r) => moved(stuck, r) < 0.1, "overloaded, they cannot move");
    await p.heading((await p.probe()).phiomiaYaw);
    await p.press("KeyE");
    await p.waitFor((r) => r.screen === 1 && r.tameWeight >= 0, { timeoutMs: 3000, note: "E opens the Phiomia's inventory" });
    const empty = (await p.probe()).tameWeight;
    await p.act("giveCreature", { inventoryId: "inventory", slot: (await p.probe()).stoneSlot });
    await p.expect((r) => r.tameWeight >= empty + 40 && r.weight < r.weightMax, "the Phiomia takes a stack of stone and the survivor is under the limit");
    await p.act("closeCreature", {});
    const freed = await p.probe();
    await p.hold("KeyS", { ms: 1000 });
    await p.expect((r) => moved(freed, r) > 0.3, "and they can walk again");
  },
});

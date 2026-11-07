import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// A stone pick lasts 40 landed swings. Setup builds a thatch wall to swing at (it outlasts 40 pick hits),
// hands over the pick and exactly one repair's worth of materials for 10 points of wear
// (1 stone, 1 wood, 2 thatch: half the recipe's share), and leaves the survivor facing the wall with the pick in hand.
const THATCH_WALL = 1600;
const PICK = 40;

export default defineProof(game, {
  proves: ["crafting.tool-wear"],
  setup(s) {
    s.command("cheat", { give: { thatch_foundation: 1, thatch_wall: 1, stone_pick: 1, stone: 1, wood: 1, thatch: 2 }, toHotbar: ["thatch_foundation", "thatch_wall", "stone_pick"] });
    s.hold("KeyD", { ms: 700 });
    s.hold("KeyW", { ms: 250 });
    s.press("Digit1");
    s.waitFor((p) => p.ghost === 1, { timeoutMs: 3000 });
    s.hold("mouse0", { until: (p) => p.structures === 1, ms: 80, timeoutMs: 3000 });
    s.hold("KeyS", { until: (p) => p.pastFloor < -4.2, ms: 80, timeoutMs: 3000 });
    s.press("Digit2");
    s.waitFor((p) => p.ghostSnapped === 1 && p.ghost === 1, { timeoutMs: 3000 });
    s.hold("mouse0", { until: (p) => p.structures === 2, ms: 80, timeoutMs: 3000 });
    s.press("Digit3");
    s.waitFor((p) => p.ghost === -1 && p.heldDurability === PICK, { timeoutMs: 3000 });
  },
  async play(p) {
    await p.hold("KeyW", { until: (r) => r.aimedStructureHealth === THATCH_WALL, ms: 80, timeoutMs: 4000 });
    await p.hold("KeyW", { ms: 400 });
    await p.hold("mouse0", { until: (r) => r.heldDurability <= PICK - 10, ms: 80, timeoutMs: 15000 });
    await p.expect((r) => r.heldDurability === PICK - 10 && r.wornTools === 1 && r.aimedStructureHealth < THATCH_WALL, "ten landed swings wear the pick ten points");
    await p.act("repairTool", { itemId: "stone_pick" });
    await p.expect((r) => r.heldDurability === PICK && r.wornTools === 0, "repairing with stone, wood and thatch makes it like new");
    await p.hold("mouse0", { until: (r) => r.heldDurability <= PICK - 10, ms: 80, timeoutMs: 15000 });
    await p.tryAct("repairTool", { itemId: "stone_pick" });
    await p.expect((r) => r.heldDurability === PICK - 10, "with the materials spent, it cannot be repaired again");
    await p.hold("mouse0", { until: (r) => r.holding === 0, ms: 80, timeoutMs: 40000 });
    await p.expect((r) => r.holding === 0 && r.heldDurability === -1 && r.wornTools === 0, "worn to zero, the pick breaks and is gone from the hand");
  },
});

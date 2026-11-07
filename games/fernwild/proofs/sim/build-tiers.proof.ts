import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Fists dent thatch but not wood. Setup builds a thatch wall on its foundation, then a wooden pillar a few
// metres to the right, and leaves the survivor facing the pillar with nothing in hand.
const THATCH_WALL = 1600;
const WOODEN_PILLAR = 6250;

export default defineProof(game, {
  proves: ["building.tiers-durability"],
  setup(s) {
    s.command("cheat", { give: { thatch_foundation: 1, thatch_wall: 1, wooden_pillar: 1 }, toHotbar: ["thatch_foundation", "thatch_wall", "wooden_pillar"] });
    // Onto open sand, clear of the palm by the spawn, facing inland.
    s.hold("KeyD", { ms: 700 });
    s.hold("KeyW", { ms: 250 });
    s.press("Digit1");
    s.waitFor((p) => p.ghost === 1, { timeoutMs: 3000 });
    s.hold("mouse0", { until: (p) => p.structures === 1, ms: 80, timeoutMs: 3000 });
    s.hold("KeyS", { until: (p) => p.pastFloor < -4.2, ms: 80, timeoutMs: 3000 });
    s.press("Digit2");
    s.waitFor((p) => p.ghostSnapped === 1 && p.ghost === 1, { timeoutMs: 3000 });
    s.hold("mouse0", { until: (p) => p.structures === 2, ms: 80, timeoutMs: 3000 });
    s.hold("KeyD", { ms: 1500 });
    s.press("Digit3");
    s.waitFor((p) => p.ghost === 1, { timeoutMs: 3000 });
    s.hold("mouse0", { until: (p) => p.structures === 3, ms: 80, timeoutMs: 3000 });
    s.waitFor((p) => p.ghost === -1, { timeoutMs: 3000 });
  },
  async play(p) {
    await p.hold("KeyW", { until: (r) => r.aimedStructureHealth === WOODEN_PILLAR, ms: 80, timeoutMs: 4000 });
    await p.hold("KeyW", { ms: 400 });
    await p.hold("mouse0", { ms: 3000 });
    await p.expect((r) => r.aimedStructureHealth === WOODEN_PILLAR, "punches leave a wooden pillar whole");
    await p.hold("KeyS", { ms: 400 });
    await p.hold("KeyA", { until: (r) => r.aimedStructureHealth === THATCH_WALL, ms: 80, timeoutMs: 5000 });
    await p.hold("KeyW", { ms: 400 });
    await p.hold("mouse0", { until: (r) => r.aimedStructureHealth > 0 && r.aimedStructureHealth < THATCH_WALL, ms: 80, timeoutMs: 3000 });
    await p.expect((r) => r.aimedStructureHealth > 0 && r.aimedStructureHealth < THATCH_WALL, "the same punches dent a thatch wall");
  },
});

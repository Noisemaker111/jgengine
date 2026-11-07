import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Metal is the next tier: ore smelted in a lit forge makes a metal pick, and only metal breaks stone. Setup
// builds a stone pillar on open sand in front of the survivor, who carries a refining forge, ore, wood, hide
// and a stone hatchet, the metal pick's engram learned. Play puts the forge down behind them and lights it.
const STONE_PILLAR = 6250;

export default defineProof(game, {
  proves: ["crafting.refine-tier"],
  setup(s) {
    s.command("onboarding.skip");
    s.command("cheat", { xp: 100_000, give: { stone_hatchet: 1, refining_forge: 1, stone_pillar: 1, metal: 2, wood: 7, hide: 10 }, toHotbar: ["stone_hatchet", "refining_forge", "stone_pillar"] });
    s.command("learn", { engramId: "metal_pick" });
    // Onto open sand, clear of the palm by the spawn, facing inland.
    s.hold("KeyD", { ms: 700 });
    s.hold("KeyW", { ms: 250 });
    s.press("Digit3");
    s.waitFor((p) => p.ghost === 1, { timeoutMs: 3000 });
    s.hold("mouse0", { until: (p) => p.structures === 1, ms: 80, timeoutMs: 3000 });
    s.waitFor((p) => p.ghost === -1, { timeoutMs: 3000 });
  },
  async play(p) {
    const facing = (await p.probe()).yaw;
    await p.heading(facing + Math.PI);
    await p.press("Digit2");
    await p.hold("mouse0", { until: (r) => r.fuel >= 0, ms: 80, timeoutMs: 3000 });
    await p.act("craft", { recipeId: "smelt_metal" });
    await p.wait(3000);
    await p.expect((r) => r.ingots === 0 && r.craftProgress === -1, "a cold forge takes nothing to smelt");
    for (let wood = 0; wood < 6; wood += 1) await p.press("KeyE");
    await p.expect((r) => r.fuel > 150, "six wood in the forge");
    await p.act("craft", { recipeId: "smelt_metal" });
    await p.waitFor((r) => r.ingots === 1, { timeoutMs: 40_000, note: "the lit forge smelts two ore into an ingot" });
    await p.act("craft", { recipeId: "metal_pick" });
    await p.waitFor((r) => r.metalPickKey > 0, { timeoutMs: 15_000, note: "the ingot makes a metal pick, slotted on the hotbar" });
    const pick = (await p.probe()).metalPickKey;
    await p.heading(facing);
    await p.press("Digit1");
    await p.hold("KeyW", { until: (r) => r.aimedStructureHealth === STONE_PILLAR, ms: 80, timeoutMs: 5000 });
    await p.hold("KeyW", { ms: 300 });
    await p.hold("mouse0", { ms: 3000 });
    await p.expect((r) => r.aimedStructureHealth === STONE_PILLAR && r.heldDurability < 40, "a stone hatchet lands on the stone pillar and leaves it whole");
    await p.press(`Digit${pick}`);
    await p.hold("mouse0", { until: (r) => r.aimedStructureHealth > 0 && r.aimedStructureHealth < STONE_PILLAR, ms: 80, timeoutMs: 3000 });
    await p.expect((r) => r.aimedStructureHealth > 0 && r.aimedStructureHealth < STONE_PILLAR, "the metal pick dents it");
  },
});

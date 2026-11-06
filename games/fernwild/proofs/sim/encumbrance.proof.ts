import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

type Reading = { x: number; z: number };
const moved = (from: Reading, to: Reading) => Math.hypot(to.x - from.x, to.z - from.z);

// Carrying slows the survivor and past the limit stops them. Setup places a storage box in front and
// loads the bag past 100 weight with stone and wood. Play tries to back away (and cannot), stores the
// wood and backs away slowly, then returns, stores a stack of stone and backs away at full pace.
export default defineProof(game, {
  proves: ["survival.encumbrance"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { give: { storage_box: 1 }, toHotbar: ["storage_box"] });
    s.press("Digit1");
    s.hold("mouse0", { until: (p) => p.boxes > 0, ms: 80, timeoutMs: 3000 });
    s.command("cheat", { give: { stone: 190, wood: 20 } });
  },
  async play(p) {
    await p.expect((r) => r.weight >= r.weightMax, "the bag weighs more than the survivor can carry");
    // A second to settle from setup's placing swing before measuring.
    await p.wait(1000);
    const stuck = await p.probe();
    await p.hold("KeyS", { ms: 1000 });
    await p.expect((r) => moved(stuck, r) < 0.1, "overloaded, they cannot move");

    await p.press("KeyE");
    await p.waitFor((r) => r.stored === 0, { timeoutMs: 3000, note: "E opens the box" });
    await p.act("storePut", { inventoryId: "inventory", slot: (await p.probe()).woodSlot });
    await p.act("closeStore", {});
    await p.expect((r) => r.weight < r.weightMax && r.weight >= r.weightMax * 0.85, "without the wood they are under the limit but still heavily loaded");
    const heavy = await p.probe();
    await p.hold("KeyS", { ms: 1000 });
    const slow = moved(heavy, await p.probe());
    await p.expect(() => slow > 0.3, `loaded, they back away ${slow.toFixed(2)} m in a second`);

    await p.hold("KeyW", { ms: 1000 });
    await p.press("KeyE");
    await p.waitFor((r) => r.stored > 0, { timeoutMs: 3000, note: "back at the box, E opens it again" });
    await p.act("storePut", { inventoryId: "inventory", slot: (await p.probe()).stoneSlot });
    await p.act("closeStore", {});
    await p.expect((r) => r.weight < r.weightMax * 0.85, "a stack of stone stored, they are no longer burdened");
    const light = await p.probe();
    await p.hold("KeyS", { ms: 1000 });
    const fast = moved(light, await p.probe());
    await p.expect(() => fast > slow * 1.3, `unburdened, they back away ${fast.toFixed(2)} m in a second, well past ${slow.toFixed(2)} m`);
  },
});

import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

export default defineProof(game, {
  proves: ["harvest.carcass"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { xp: 100_000, spend: { health: 45, stamina: 8 }, give: { spear: 1 }, toHotbar: ["spear"] });
    s.press("Digit1");
    s.hold("KeyD", { until: (p) => p.acrossSpawn > 3, ms: 200, timeoutMs: 4000 });
    s.hold("KeyW", { ms: 250 });
    s.command("cheat", { summon: { species: "raptor", level: 1, distance: 4 } });
    s.wait(500);
  },
  async play(p) {
    const before = await p.probe();
    // Spear the raptor that comes at you, then keep striking the body it leaves.
    await p.hold("mouse0", { until: (r) => r.carcassDist >= 0, ms: 200, timeoutMs: 20_000 });
    await p.hold("mouse0", { until: (r) => r.rawMeat > before.rawMeat && r.hide > before.hide, ms: 200, timeoutMs: 20_000 });
    await p.expect((r) => r.rawMeat > before.rawMeat && r.hide > before.hide, "the raptor's body gave meat and hide");
  },
});

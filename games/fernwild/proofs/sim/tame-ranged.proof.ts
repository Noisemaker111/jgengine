import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

/** A raptor (aggressive, 180 torpor at level 1) 25 m away; the bow and tranquilizer arrows drop it before it reaches you. */
export default defineProof(game, {
  proves: ["taming.ranged-knockout"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { xp: 100_000, give: { bow: 1, tranq_arrow: 10 }, toHotbar: ["bow"] });
    s.press("Digit1");
    s.hold("KeyD", { until: (p) => p.acrossSpawn > 3, ms: 200, timeoutMs: 4000 });
    s.command("cheat", { summon: { species: "raptor", level: 1, distance: 25 } });
  },
  async play(p) {
    const start = await p.probe();
    // Aim back down the spawn facing, where the raptor stands.
    await p.heading(Math.PI);
    await p.hold("mouse0", { until: (r) => r.down > start.down, timeoutMs: 8000 });
    await p.expect((r) => r.down > start.down, "the raptor lies unconscious");
    await p.expect((r) => r.tranqArrows < start.tranqArrows && r.tranqArrows >= start.tranqArrows - 4, "a few tranquilizer arrows were spent");
    await p.expect((r) => r.health === start.health, "it never reached the survivor");
  },
});

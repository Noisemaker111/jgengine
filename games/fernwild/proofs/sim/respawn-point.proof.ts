import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// A placed sleeping bag is where the survivor wakes after dying, once. Setup places one, walks the survivor
// forty metres off and wakes a wild Rex beside them. Play stands there until the Rex kills them: they wake on
// the bag, and the bag is used up.
export default defineProof(game, {
  proves: ["survival.respawn-point"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { give: { hide_sleeping_bag: 1 }, toHotbar: ["hide_sleeping_bag"] });
    s.press("Digit1");
    s.hold("mouse0", { until: (p) => p.bags > 0, ms: 80, timeoutMs: 3000 });
    s.command("cheat", { turn: Math.PI });
    s.hold("KeyW", { until: (p) => Math.hypot(p.x - p.bagX, p.z - p.bagZ) > 40, timeoutMs: 20_000 });
    s.command("cheat", { summon: { species: "rex", level: 60, distance: 4 } });
  },
  async play(p) {
    const start = await p.probe();
    await p.expect((r) => r.bags === 1 && Math.hypot(r.x - r.bagX, r.z - r.bagZ) > 40, "the bag lies forty metres behind, a wild Rex in front");
    await p.waitFor((r) => r.bags === 0, { timeoutMs: 60_000, note: "the Rex kills the survivor" });
    await p.expect((r) => Math.hypot(r.x - start.bagX, r.z - start.bagZ) < 1.5, "they wake on the sleeping bag");
    await p.expect((r) => r.health === r.healthMax, "with full health");
  },
});

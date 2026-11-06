import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// A raptor charges from fifteen metres. A thrown bola wraps its legs: it stays where it is while the bola
// holds, then the hold wears off and it comes on again.
export default defineProof(game, {
  proves: ["taming.trap"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { destroyWild: true, xp: 100_000, spend: { health: 45 }, give: { bola: 3 }, toHotbar: ["bola"] });
    s.press("Digit1");
    s.hold("KeyD", { until: (p) => p.acrossSpawn > 3, ms: 200, timeoutMs: 4000 });
    s.hold("KeyW", { ms: 250 });
    s.command("cheat", { summon: { species: "raptor", level: 1, distance: 15 } });
    s.wait(200);
  },
  async play(p) {
    await p.expect((r) => r.held === 0 && r.threatDist > 0, "a raptor out there, nothing held");
    await p.hold("mouse0", { until: (r) => r.held === 1, timeoutMs: 5000 });
    const caught = await p.probe();
    await p.wait(5000);
    await p.expect((r) => r.held === 1 && Math.abs(r.threatDist - caught.threatDist) < 0.3, "tangled, it has not moved in five seconds");
    await p.waitFor((r) => r.held === 0, { timeoutMs: 20_000, note: "the bola wears off" });
    await p.waitFor((r) => r.threatDist < caught.threatDist - 2, { timeoutMs: 10_000, note: "free, it comes on again" });
  },
});

import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The swamp cave's gas eats at the survivor standing in it; stepping back out to the mouth, the air is clean.
export default defineProof(game, {
  proves: ["cave.hazards"],
  setup(s) {
    s.waitFor((p) => p.pedestals === 8, { timeoutMs: 60_000 });
    s.command("cheat", { destroyWild: true, goto: { cave: "cave_swamp_cave", back: 6 } });
    s.wait(500);
  },
  async play(p) {
    await p.expect((r) => r.caveDepth === -1 && r.hazards === 0, "outside the swamp cave, nothing in the air");
    await p.hold("KeyW", { until: (r) => r.caveDepth > 3, ms: 200, timeoutMs: 8000 });
    const inside = await p.probe();
    await p.waitFor((r) => r.hazards === 1, { timeoutMs: 1000, note: "swamp gas" });
    await p.waitFor((r) => r.health <= inside.health - 3, { timeoutMs: 20_000, note: "the gas takes health" });
    await p.hold("KeyS", { until: (r) => r.caveDepth === -1, ms: 200, timeoutMs: 8000 });
    await p.waitFor((r) => r.hazards === 0, { timeoutMs: 1000, note: "out in clean air" });
  },
});

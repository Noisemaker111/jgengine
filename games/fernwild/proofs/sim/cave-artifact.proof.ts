import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

export default defineProof(game, {
  proves: ["cave.artifact-run"],
  setup(s) {
    s.waitFor((p) => p.pedestals === 8, { timeoutMs: 60_000 });
    s.command("cheat", { goto: { cave: "cave_lower_south_cave", back: 6 } });
    s.hold("KeyW", { until: (p) => Math.abs(p.yaw - 2.75) < 0.15, ms: 60, timeoutMs: 3000 });
  },
  async play(p) {
    await p.hold("KeyW", { until: (r) => r.caveDepth > 12, ms: 200, timeoutMs: 8000 });
    await p.hold("KeyW", { until: (r) => r.atPedestal === 1, ms: 200, timeoutMs: 15_000 });
    await p.hold("KeyE", { until: (r) => r.artifacts === 1, timeoutMs: 3000 });
    await p.expect((r) => r.pedestals === 7, "the pedestal is empty and the artifact carried");
  },
});

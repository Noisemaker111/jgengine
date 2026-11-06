import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

export default defineProof(game, {
  proves: ["onboarding.first-goal"],
  async play(p) {
    await p.expect((r) => r.taught === 0, "a new survivor with the first step still to take");
    await p.hold("mouse0", { until: (r) => r.taught >= 1, timeoutMs: 20_000 });
    await p.expect((r) => r.taught >= 1, "the first step of the survivor's path done");
  },
});

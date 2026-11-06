import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

export default defineProof(game, {
  proves: ["onboarding.first-goal"],
  async play(p) {
    const start = await p.expect((r) => r.goalKind >= 0 && r.taught === 0, "a new game points at its first goal");
    // Follow the marker on foot, then press E on whoever it points at.
    for (let step = 0; step < 300; step += 1) {
      const r = await p.probe();
      if (r.goalDistance >= 0 && r.goalDistance < 2.5) break;
      await p.heading(Math.atan2(r.goalX - r.playerX, r.goalZ - r.playerZ));
      await p.hold("KeyW", { ms: r.goalDistance > 6 ? 400 : 120 });
    }
    // E opens what B0-LT has to say; read it, and a second E takes the job.
    await p.hold("KeyE", { until: (r) => r.dialogOpen === 1, timeoutMs: 3000 });
    await p.wait(3000);
    await p.press("KeyE");
    await p.expect((r) => r.taught > start.taught || r.questsSeen > start.questsSeen, "the first goal advanced");
  },
});

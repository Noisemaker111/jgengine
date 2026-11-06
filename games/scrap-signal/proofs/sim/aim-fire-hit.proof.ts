import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { armed, huskAhead, pull } from "./scenarios";

export default defineProof(game, {
  proves: ["shooter.aim-fire-hit"],
  setup(s) {
    s.waitFor((p) => p.health > 0, { timeoutMs: 10_000 });
    armed(s, "rifle");
    huskAhead(s, 12);
  },
  async play(p) {
    const before = (await p.probe()).kills;
    await p.heading(0);
    for (let shot = 0; shot < 80 && (await p.probe()).kills === before; shot += 1) {
      const r = await p.probe();
      // Aim where the husk is: straight ahead, or at the attack it winds up once it is close.
      await pull(p, r.windups > 0 ? r.windupHeading : 0, -0.03);
    }
    await p.expect((r) => r.kills > before, "the husk shot down");
  },
});

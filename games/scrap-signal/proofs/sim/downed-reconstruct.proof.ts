import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

export default defineProof(game, {
  proves: ["failure.lose-and-recover"],
  setup(s) {
    s.waitFor((p) => p.health > 0, { timeoutMs: 10_000 });
    // What the dev-only `reserve.capture` does: the chassis on its last point of health, so the game's
    // own downed tick opens the Emergency Reserve window.
    const health = s.ctx.scene.entity.stats.get(s.userId, "health");
    if (health !== null) s.ctx.scene.entity.stats.delta(s.userId, "health", -Math.max(0, health.current - (health.min ?? 1)));
    s.waitFor((p) => p.reserveDowned === 1, { timeoutMs: 5000 });
  },
  async play(p) {
    const { scrapCash: cash } = await p.probe();
    // Nobody comes: the window runs out and the game reconstructs the chassis for its fee.
    await p.waitFor((r) => r.reserveDowned === 0 && r.reserveDead === 0, { timeoutMs: 20_000, note: "reconstructed" });
    await p.expect((r) => r.health > 0 && r.scrapCash === cash - Math.floor(cash * 0.07), "back in play, 7% of the wallet paid");
  },
});

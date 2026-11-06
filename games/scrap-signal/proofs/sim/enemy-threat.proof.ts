import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { huskAhead } from "./scenarios";

export default defineProof(game, {
  proves: ["shooter.enemy-threat"],
  setup(s) {
    s.waitFor((p) => p.health > 0, { timeoutMs: 10_000 });
    huskAhead(s, 10);
  },
  async play(p) {
    const start = (await p.probe()).health;
    await p.waitFor((r) => r.windups > 0, { timeoutMs: 20_000, note: "the husk closes and winds up an attack" });
    await p.waitFor((r) => r.health < start, { timeoutMs: 20_000, note: "the husk's hit lands" });
  },
});

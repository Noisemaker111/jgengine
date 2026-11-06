import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { armed, pull } from "./scenarios";

export default defineProof(game, {
  proves: ["shooter.reload-ammo"],
  setup(s) {
    s.waitFor((p) => p.health > 0, { timeoutMs: 10_000 });
    armed(s, "pistol");
  },
  async play(p) {
    // Empty half the magazine into the sky.
    for (let shot = 0; shot < 60 && (await p.probe()).magFill >= 0.5; shot += 1) await pull(p, 0, 0.6);
    await p.expect((r) => r.magFill < 0.5 && r.heldAmmo > 0, "the magazine half empty, rounds carried");
    await p.press("KeyR");
    await p.waitFor((r) => r.magFill === 1, { timeoutMs: 6000, note: "reloaded from the carried rounds" });
  },
});

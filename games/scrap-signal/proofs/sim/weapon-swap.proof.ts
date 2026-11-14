import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { award, unlock } from "../../src/game/progression/unlocks";
import { armed } from "./scenarios";

export default defineProof(game, {
  proves: ["shooter.weapon-swap"],
  setup(s) {
    s.waitFor((p) => p.health > 0, { timeoutMs: 10_000 });
    // Two weapon slots open, as Big Mulch's errand opens them: a staple gun in one, a toaster in two.
    award(s.ctx, unlock.slot(1));
    award(s.ctx, unlock.slot(2));
    armed(s, "launcher", 1);
    armed(s, "pistol", 0);
  },
  async play(p) {
    const before = await p.probe();
    await p.expect((r) => r.heldSlot === 0 && r.gunsHeld === 2, "two weapons carried, the first in hand");
    await p.press("Digit2");
    await p.waitFor((r) => r.heldSlot === 1 && r.heldPower !== before.heldPower, { timeoutMs: 2000, note: "the second weapon in hand" });
    await p.press("Digit1");
    await p.waitFor((r) => r.heldSlot === 0 && r.heldPower === before.heldPower, { timeoutMs: 2000, note: "back to the first" });
  },
});

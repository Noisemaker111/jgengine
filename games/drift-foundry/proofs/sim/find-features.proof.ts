import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// A new shopper does only what the aisle tells them: push (the sign), hop when the sign says JUMP NOW,
// steer the way the shopping tip points (to the mod display a wall needs, or to grab stock), and press F when the tip says so. That reaches
// every core feature's first use: a mod snapped on, an item in the basket, a pallet ramp cleared, a
// power-up fired.
export default defineProof(game, {
  proves: ["onboarding.find-features"],
  state: "race",
  async play(p) {
    await p.waitFor((r) => r.phase === 1 && r.goal === 1, { timeoutMs: 30_000, note: "the sign shows the first goal" });
    await p.expect((r) => r.mods === 0 && r.items === 0 && r.gates === 0 && r.powersUsed === 0, "nothing used yet");
    for (let step = 0; step < 900; step += 1) {
      const r = await p.probe();
      if (r.phase !== 1 || (r.mods > 0 && r.items > 0 && r.gates >= 2 && r.powersUsed > 0)) break;
      if (r.jumpNow === 1) await p.press("Space");
      else if (r.tip === 2) await p.press("KeyF");
      else {
        // Head the way the tip points (a gentle angle, not a spin), or back to the middle of the aisle.
        const want = r.tip === 1 ? r.tipSide * 0.5 : r.tip === 3 && r.tipSide !== 0 ? r.tipSide * 0.3 : Math.max(-0.35, Math.min(0.35, -r.x * 0.08));
        const turn = want - r.heading;
        await p.hold(Math.abs(turn) < 0.08 ? "KeyW" : ["KeyW", turn > 0 ? "KeyA" : "KeyD"], { ms: 150 });
      }
    }
    await p.expect((r) => r.mods > 0, "a mod display snapped a mod on");
    await p.expect((r) => r.items > 0, "the tip's shelf put stock in the basket");
    await p.expect((r) => r.gates >= 2, "the sign's JUMP NOW cleared a pallet ramp (and the plow its box wall)");
    await p.expect((r) => r.powersUsed > 0, "F fired the power-up the tip named");
  },
});

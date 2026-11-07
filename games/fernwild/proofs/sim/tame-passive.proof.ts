import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// An Ovis is one of ARK's passive tames: no club, no narcotics. Walk up while it is hungry, hand it a
// berry with E, wait for it to digest, and again, until it is yours, awake the whole time.
export default defineProof(game, {
  proves: ["taming.passive-feed"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { give: { mejoberry: 100 }, tamingSpeed: 20, summon: { species: "ovis", level: 1, distance: 2.5 } });
    s.wait(300);
  },
  async play(p) {
    const start = await p.probe();
    await p.press("KeyE");
    await p.waitFor((r) => r.tameProgress > 0, { timeoutMs: 2000, note: "it ate the first berry from the hand" });
    // It grazes on between meals: keep up with it, face it, and offer again.
    for (let meal = 0; meal < 120 && (await p.probe()).tamed === start.tamed; meal += 1) {
      await p.expect((r) => r.screen === 0, "no knock-out: no inventory to open, it stays awake");
      await p.heading((await p.probe()).ovisYaw);
      if ((await p.probe()).ovisDist > 2.2) await p.hold("KeyW", { until: (r) => r.ovisDist <= 2.2, ms: 100, timeoutMs: 3000 });
      await p.heading((await p.probe()).ovisYaw);
      await p.press("KeyE");
      await p.wait(300);
    }
    const end = await p.probe();
    await p.expect((r) => r.tamed === start.tamed + 1 && r.berries < start.berries, `hand-fed ${start.berries - end.berries} berries while hungry, the Ovis is tamed (progress ${end.tameProgress}%)`);
  },
});

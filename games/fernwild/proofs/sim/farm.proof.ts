import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// A crop plot grows a harvest from a seed, but only once it has water and fertilizer. Setup places a small
// crop plot in front of the survivor with a mejoberry seed, a bag of fertilizer and a waterskin carried.
// Play plants the seed and waits: with no fertilizer it does not grow. Then E feeds and waters it, the crop
// ripens, and E picks ten mejoberries.
export default defineProof(game, {
  proves: ["survival.farm"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { give: { crop_plot: 1, mejoberry_seed: 1, fertilizer: 1, waterskin: 1 }, toHotbar: ["crop_plot"] });
    // Onto open sand, clear of the palm by the spawn.
    s.hold("KeyD", { ms: 700 });
    s.press("Digit1");
    s.hold("mouse0", { until: (p) => p.plots > 0, ms: 80, timeoutMs: 3000 });
  },
  async play(p) {
    await p.waitFor((r) => r.plotSeeded === 0, { timeoutMs: 3000, note: "a bare crop plot stands in front" });
    // E with the seed carried plants it; the fertilizer and waterskin wait their turn.
    await p.press("KeyE");
    await p.expect((r) => r.plotSeeded === 1, "the seed is planted");
    // Planted but not yet fed, it waits: a minute on, it has not grown.
    await p.wait(60_000);
    await p.expect((r) => r.plotGrowth === 0, "a seed with no fertilizer does not grow");
    await p.press("KeyE");
    await p.expect((r) => r.plotFertilizer > 0, "E adds the fertilizer");
    await p.press("KeyE");
    await p.expect((r) => r.plotWater > 0, "E pours the waterskin in");
    const before = (await p.probe()).mejoberries;
    await p.waitFor((r) => r.plotGrowth > 0, { timeoutMs: 30_000, note: "watered and fertilized, the crop grows" });
    // Top the water up whenever E would (the plot drinks as it grows), until it ripens.
    for (let tend = 0; tend < 40 && (await p.probe()).plotGrowth < 100; tend += 1) {
      if ((await p.probe()).plotWater <= 75) await p.press("KeyE");
      await p.wait(20_000);
    }
    await p.expect((r) => r.plotGrowth === 100, "the crop ripens");
    await p.press("KeyE");
    await p.expect((r) => r.mejoberries >= before + 10, "E picks ten mejoberries from it");
  },
});

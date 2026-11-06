import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { SEA_LEVEL } from "../../src/world";

/** The nearest sea at least `depth` metres deep, looking out from the survivor in growing rings. */
function deepWaterNear(ground: (x: number, z: number) => number, from: readonly [number, number, number], depth: number): [number, number] | null {
  for (let radius = 10; radius <= 600; radius += 10) {
    for (let step = 0; step < 36; step += 1) {
      const angle = (step / 36) * Math.PI * 2;
      const x = from[0] + Math.sin(angle) * radius;
      const z = from[2] + Math.cos(angle) * radius;
      if (ground(x, z) < SEA_LEVEL - depth) return [x, z];
    }
  }
  return null;
}

// Out at sea: holding C swims down, and breath falls once the head is under; Space swims back up and
// breath refills at the surface.
export default defineProof(game, {
  proves: ["survival.oxygen-swim"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    const me = s.ctx.scene.entity.get(s.ctx.player.userId)!.position;
    const sea = deepWaterNear((x, z) => s.ctx.world.groundHeightAt(x, z), me, 6);
    if (sea === null) throw new Error("no sea six metres deep near the spawn");
    s.command("cheat", { destroyWild: true, teleport: [sea[0], sea[1]] });
    s.wait(1500);
  },
  async play(p) {
    await p.expect((r) => r.underwater === 0 && r.oxygen === 100, "afloat at the surface, breath full");
    await p.hold("KeyC", { until: (r) => r.oxygen <= 60, timeoutMs: 60_000 });
    await p.expect((r) => r.underwater === 1, "under water, breath running out");
    await p.hold("Space", { until: (r) => r.underwater === 0, timeoutMs: 10_000 });
    await p.waitFor((r) => r.oxygen === 100, { timeoutMs: 20_000, note: "breath refills at the surface" });
  },
});

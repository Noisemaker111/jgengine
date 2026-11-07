import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { SEA_LEVEL } from "../../src/world";

/** The nearest sea at least `depth` metres deep, looking out from `from` in growing rings. */
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

/** Which way the sea lies from the beach setup picked. */
let seaward = 0;

// A swimming tame carries its rider through water. Setup finds the beach between the spawn and the nearest deep
// sea and puts the survivor on it, facing the sea, with a tamed Sarco and its saddle. Play saddles and mounts it,
// rides into the sea, and keeps riding: afloat, it swims well over 25 m in four seconds, where a mount that is no
// swimmer only wades at a share of its walk.
export default defineProof(game, {
  proves: ["creatures.ride.swim"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    const ground = (x: number, z: number) => s.ctx.world.groundHeightAt(x, z);
    const me = s.ctx.scene.entity.get(s.ctx.player.userId)!.position;
    const sea = deepWaterNear(ground, me, 4);
    if (sea === null) throw new Error("no sea four metres deep near the spawn");
    const [dx, dz] = [me[0] - sea[0], me[2] - sea[1]];
    const length = Math.hypot(dx, dz);
    let beach: [number, number] | null = null;
    for (let along = 0; along < length && beach === null; along += 1) {
      const [x, z] = [sea[0] + (dx / length) * along, sea[1] + (dz / length) * along];
      if (ground(x, z) > SEA_LEVEL + 0.6) beach = [x + (dx / length) * 4, z + (dz / length) * 4];
    }
    if (beach === null) throw new Error("no beach between the spawn and the sea");
    seaward = Math.atan2(-dx, -dz);
    s.command("cheat", { destroyWild: true, teleport: [beach[0], beach[1], seaward] });
    s.wait(500);
    s.command("cheat", { give: { sarco_saddle: 1 }, summon: { species: "sarco", level: 1, distance: 2.5, tamed: true } });
    s.wait(500);
  },
  async play(p) {
    await p.hold("KeyE", { until: (r) => r.screen === 1, timeoutMs: 3000 });
    await p.act("giveCreature", { inventoryId: "inventory", slot: (await p.probe()).saddleSlot });
    await p.act("closeCreature", {});
    await p.hold("KeyE", { until: (r) => r.riding === 1, timeoutMs: 3000 });
    await p.expect((r) => r.mountSwimmer === 1 && r.mountSwimming === 0, "riding the Sarco on the beach");
    await p.heading(seaward);
    await p.hold("KeyW", { until: (r) => r.mountSwimming === 1, timeoutMs: 15_000 });
    const start = await p.probe();
    await p.hold("KeyW", { ms: 4000 });
    await p.expect((r) => r.riding === 1 && r.mountSwimming === 1 && r.underwater === 0, "still riding it, swimming at the surface");
    await p.expect((r) => Math.hypot(r.x - start.x, r.z - start.z) > 25, "it swam over 25 m in four seconds");
  },
});

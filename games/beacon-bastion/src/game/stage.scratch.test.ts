import { test } from "bun:test";

import { tickTowers } from "./combat/towerAI";
import { keep, towerStats } from "./keep";
import { session } from "./session";
import { advanceKeep, beaconRunner } from "./testing";
import { spawnRaider, tickWaves } from "./waves/director";
import { FLANK_POINT_KEY, SPAWN_POINT_KEY } from "./world/path";

test("scratch: a farmer on the flank shoots drones", () => {
  const runner = beaconRunner("scratch");
  const world = keep.of(runner.ctx);
  world.set("keep.gold", 5000);
  runner.ui.invoke("beacon.place", { kind: "worker_farmer", slot: "plot-10" });
  runner.ui.invoke("beacon.place", { kind: "worker_barista", slot: "plot-5" });
  advanceKeep(runner, 5);
  const ids = world.instances().map((t) => t.id);
  console.log("towers", ids, ids.map((id) => towerStats(world, id)));
  const drone = spawnRaider(runner.ctx, "tech_drone", FLANK_POINT_KEY);
  const phone = spawnRaider(runner.ctx, "tech_phone", SPAWN_POINT_KEY);
  for (let t = 0; t < 30; t += 0.1) {
    tickWaves(runner.ctx, 0.1);
    tickTowers(runner.ctx, 0.1);
  }
  console.log("drone alive", session.creeps.has(drone), "phone alive", session.creeps.has(phone), "gold", world.num("keep.gold"), "lives", world.num("keep.lives"));
  console.log("shots", [...session.towerShots.entries()]);
});

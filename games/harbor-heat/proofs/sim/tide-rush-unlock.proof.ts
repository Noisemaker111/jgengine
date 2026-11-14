import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { RACE_ROUTES } from "../../src/game/world/districts";
import { streetPlayOf } from "../../src/game/streetPlay";

/**
 * The Ocean Loop Tide Rush with every gate but the last behind the rider: crossing the line first wins it,
 * and the next circuit on the ladder, the Dockside Dash, opens.
 */
export default defineProof(game, {
  proves: ["racing.unlock-vehicles-tracks"],
  setup(s) {
    const route = RACE_ROUTES.find((r) => r.id === "race-loop");
    if (route === undefined) throw new Error("no Ocean Loop");
    const gates = route.checkpoints;
    const start = gates.at(-1)!;
    const id = s.ctx.scene.entity.spawn("car_compact", { position: [start[0], s.ctx.world.groundHeightAt(start[0], start[1]), start[1]], role: "prop", meta: { owned: true } });
    s.teleport({ x: start[0] + 1.5, z: start[1] });
    s.command("vehicle.enter", { vehicle: id });
    s.ctx.game.economy.grant(s.userId, "cash", 500);
    s.waitFor((r) => r["driving"] === 1, { timeoutMs: 1000 });
    s.command("race.start");
    s.waitFor((r) => r["racing"] === 1, { timeoutMs: 1000, note: "the Tide Rush is on" });
    // Through every gate but the finish line, in order.
    // A ridden car is placed through the driving slice so its sim restarts from the new pose.
    const place = (x: number, z: number, heading: number) => streetPlayOf(s.ctx).placeVehicle(s.ctx, id, [x, s.ctx.world.groundHeightAt(x, z), z], heading);
    for (const [index, gate] of gates.slice(0, -1).entries()) {
      place(gate[0], gate[1], 0);
      s.waitFor((r) => Number(r["raceCheckpoint"]) >= index + 1, { timeoutMs: 1000, note: `gate ${index + 1}` });
    }
    // Short of the line, facing it.
    const last = gates.at(-2)!;
    const dx = start[0] - last[0];
    const dz = start[1] - last[1];
    const length = Math.hypot(dx, dz) || 1;
    place(start[0] - (dx / length) * 30, start[1] - (dz / length) * 30, Math.atan2(dx, dz));
  },
  async play(p) {
    await p.expect((r) => r["raceFinished"] === 0 && r["circuitsOpen"] === 1, "racing the last straight, only the Ocean Loop open");
    await p.hold("KeyW", { until: (r) => r["raceFinished"] === 1, timeoutMs: 15_000 });
    await p.waitFor((r) => r["circuitsOpen"] === 2, { timeoutMs: 2000, note: "the win opens the Dockside Dash" });
  },
});

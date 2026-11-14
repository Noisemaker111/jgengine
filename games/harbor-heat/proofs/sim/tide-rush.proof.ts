import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { RACE_ROUTES } from "../../src/game/world/districts";

/**
 * The Ocean Loop Tide Rush on the family scooter: the clock runs from the start, the rider takes the first
 * gate, and Tony Carmine's scooter races the loop to a finish order.
 */
export default defineProof(game, {
  proves: ["racing.lap-timing", "racing.opponents"],
  setup(s) {
    const route = RACE_ROUTES.find((r) => r.id === "race-loop");
    const start = route?.checkpoints.at(-1);
    if (start === undefined) throw new Error("no Ocean Loop");
    // Facing east down the strip, where the next gate is.
    const id = s.ctx.scene.entity.spawn("car_compact", { position: [start[0], s.ctx.world.groundHeightAt(start[0], start[1]), start[1]], rotationY: Math.PI / 2, role: "prop", meta: { owned: true } });
    s.teleport({ x: start[0] + 1.5, z: start[1] });
    s.command("vehicle.enter", { vehicle: id });
    s.ctx.game.economy.grant(s.userId, "cash", 500);
    s.waitFor((r) => r["driving"] === 1, { timeoutMs: 1000 });
    s.command("race.start");
    s.waitFor((r) => r["racing"] === 1, { timeoutMs: 1000, note: "the Tide Rush is on" });
  },
  async play(p) {
    const start = await p.expect((r) => Number(r["raceCheckpoint"]) <= 1 && r["raceFinished"] === 0, "racing, at most the start gate taken");
    await p.hold("KeyW", { until: (r) => Number(r["raceCheckpoint"]) > Number(start["raceCheckpoint"]), timeoutMs: 20_000 });
    await p.expect((r) => Number(r["raceCheckpoint"]) > Number(start["raceCheckpoint"]) && Number(r["raceTime"]) > Number(start["raceTime"]), "the next gate is taken on a running clock");
    await p.waitFor((r) => r["raceFinished"] === 1, { timeoutMs: 400_000, note: "the rival rides the loop to the line" });
    await p.expect((r) => Number(r["racePosition"]) >= 1, "a finish order exists");
  },
});

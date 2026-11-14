import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { SHOP_SCOOTER } from "../../src/game/pizza/shift";

/** On the family scooter: the throttle builds speed, steering turns it, the brake scrubs it off. */
export default defineProof(game, {
  proves: ["racing.drive-handling"],
  setup(s) {
    const scooter = s.ctx.scene.entity.get(SHOP_SCOOTER);
    if (scooter === null) throw new Error("the shop scooter is not at the kerb");
    s.teleport({ x: scooter.position[0] + 1.5, z: scooter.position[2] });
    s.command("vehicle.enter", { vehicle: SHOP_SCOOTER });
    s.waitFor((r) => r["driving"] === 1, { timeoutMs: 1000 });
  },
  async play(p) {
    const parked = await p.expect((r) => r["speed"] === 0, "at rest at the kerb");
    await p.hold("KeyW", { ms: 2000 });
    const rolling = await p.expect((r) => Number(r["speed"]) > 20, "the throttle builds speed");
    await p.hold(["KeyW", "KeyD"], { ms: 1200 });
    await p.expect((r) => Math.abs(Number(r["yaw"]) - Number(rolling["yaw"])) > 0.3, "steering turns the scooter");
    await p.hold("KeyS", { ms: 1500 });
    await p.expect((r) => Number(r["speed"]) < Number(rolling["speed"]) && Math.hypot(Number(r["x"]) - Number(parked["x"]), Number(r["z"]) - Number(parked["z"])) > 5, "the brake scrubs the speed off");
  },
});

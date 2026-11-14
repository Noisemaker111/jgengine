import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { clockTo } from "./scenarios";

/** On a scooter in Port Carmine as the evening tide comes in: the street turns to canal and the engine drowns. */
export default defineProof(game, {
  proves: ["delivery.route-changes"],
  setup(s) {
    clockTo(s, 18.7);
    const at: readonly [number, number] = [130, 190];
    const id = s.ctx.scene.entity.spawn("car_compact", { position: [at[0], s.ctx.world.groundHeightAt(at[0], at[1]), at[1]], role: "prop", meta: { owned: true } });
    s.teleport({ x: at[0] + 1.5, z: at[1] });
    s.command("vehicle.enter", { vehicle: id });
    s.waitFor((r) => r["driving"] === 1, { timeoutMs: 1000 });
  },
  async play(p) {
    await p.expect((r) => r["stuck"] === 0 && r["medium"] === 1, "the scooter still runs in the ankle water");
    // Parked at the kerb with the engine running, the rider watches the water climb.
    await p.waitFor((r) => r["stuck"] === 1, { timeoutMs: 60_000, note: "the evening tide reaches canal depth" });
    await p.expect((r) => r["stuck"] === 1 && Number(r["tideStage"]) >= 2, "canal hour: the scooter's engine drowned");
  },
});

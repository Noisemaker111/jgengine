import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { SHOP_SCOOTER } from "../../src/game/pizza/shift";

/** The family scooter at the kerb: walk up, get on and ride. */
export default defineProof(game, {
  proves: ["open-world.vehicle-enter-drive"],
  setup(s) {
    const scooter = s.ctx.scene.entity.get(SHOP_SCOOTER);
    if (scooter === null) throw new Error("the shop scooter is not at the kerb");
    s.teleport({ x: scooter.position[0] + 1.5, z: scooter.position[2] });
  },
  async play(p) {
    const parked = await p.expect((r) => r["driving"] === 0, "on foot beside the scooter");
    await p.press("KeyE");
    await p.waitFor((r) => r["driving"] === 1 && r["medium"] === 1, { timeoutMs: 2000, note: "on the scooter" });
    await p.hold("KeyW", { ms: 2500 });
    await p.expect((r) => Math.hypot(Number(r["x"]) - Number(parked["x"]), Number(r["z"]) - Number(parked["z"])) > 4, "the scooter rode off");
  },
});

import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { clockTo } from "./scenarios";

/** A scooter drowned in Port Carmine at high water: the tow hauls it to Vell's kerb for $40 and it rides on. */
export default defineProof(game, {
  proves: ["racing.crash-recover"],
  setup(s) {
    clockTo(s, 21);
    const at: readonly [number, number] = [130, 190];
    const id = s.ctx.scene.entity.spawn("car_compact", { position: [at[0], s.ctx.world.groundHeightAt(at[0], at[1]), at[1]], role: "prop", meta: { owned: true } });
    s.teleport({ x: at[0] + 1.5, z: at[1] });
    s.command("vehicle.enter", { vehicle: id });
    s.waitFor((r) => r["stuck"] === 1, { timeoutMs: 2000, note: "the engine is drowned" });
  },
  async play(p) {
    const drowned = await p.expect((r) => r["stuck"] === 1 && r["driving"] === 1, "stranded in the canal");
    await p.press("KeyH");
    const towed = await p.waitFor((r) => r["stuck"] === 0 && r["driving"] === 1, { timeoutMs: 2000, note: "towed to dry ground, still aboard" });
    await p.expect((r) => r["cash"] === Number(drowned["cash"]) - 40, "the tow cost $40");
    await p.hold("KeyW", { ms: 2000 });
    await p.expect((r) => Math.hypot(Number(r["x"]) - Number(towed["x"]), Number(r["z"]) - Number(towed["z"])) > 3, "and rides on");
  },
});

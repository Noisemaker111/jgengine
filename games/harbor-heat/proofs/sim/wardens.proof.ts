import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { streetPlayOf } from "../../src/game/streetPlay";

/** A ticket's worth of Warden heat on a rider in Sunset Motors' bay: lying low there, the heat falls away. */
export default defineProof(game, {
  proves: ["open-world.pursuit"],
  setup(s) {
    // Heat is witness-gated: a bystander on the strip sees the reckless riding, then the rider ducks into the bay.
    s.teleport({ x: -68, z: 150 });
    const me = s.ctx.scene.entity.get(s.userId)!.position;
    s.ctx.scene.entity.spawn("ped_city", { id: "proof_witness", position: [me[0] + 4, me[1], me[2]], rotationY: -Math.PI / 2, role: "npc" });
    s.wait(200);
    streetPlayOf(s.ctx).addHeat(s.ctx, streetPlayOf(s.ctx).heatForStars(1) + 5);
    s.waitFor((r) => Number(r["stars"]) >= 1, { timeoutMs: 2000, note: "someone called in a reckless rider" });
    s.ctx.scene.entity.despawn("proof_witness");
    s.teleport({ x: -68, z: 116 });
  },
  async play(p) {
    await p.expect((r) => Number(r["stars"]) >= 1, "the Wardens are looking");
    await p.waitFor((r) => r["stars"] === 0, { timeoutMs: 120_000, note: "lying low in the bay, the Wardens lose interest" });
  },
});

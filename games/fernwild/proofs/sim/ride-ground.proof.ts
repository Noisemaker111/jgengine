import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { raptorTamed } from "./scenarios";

export default defineProof(game, {
  proves: ["creatures.ride.ground"],
  setup: (s) => raptorTamed(s, { raptor_saddle: 1 }),
  async play(p) {
    await p.act("giveCreature", { inventoryId: "inventory", slot: (await p.probe()).saddleSlot });
    await p.waitFor((r) => r.saddled === 1, { timeoutMs: 3000, note: "saddled" });
    await p.act("closeCreature", {});
    await p.hold("KeyE", { until: (r) => r.riding === 1, timeoutMs: 3000 });
    const start = await p.probe();
    await p.hold("KeyW", { ms: 3000 });
    await p.expect((r) => r.riding === 1 && Math.hypot(r.x - start.x, r.z - start.z) > 8, "rode more than 8 m in 3 s");
  },
});

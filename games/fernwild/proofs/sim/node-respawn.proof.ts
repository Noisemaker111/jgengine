import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Picked clean, a berry bush is gone until it grows back. Play walks to the nearest one, picks it until the
// nearest bush is a different one, then waits out the regrow (five minutes for a bush) and picks the same
// bush again.
export default defineProof(game, {
  proves: ["harvest.node-respawn"],
  setup(s) {
    s.waitFor((p) => p.bushDist > 0, { timeoutMs: 60_000 });
  },
  async play(p) {
    await p.heading((await p.probe()).bushYaw);
    await p.hold("KeyW", { until: (r) => r.bushDist < 1.3, timeoutMs: 60_000 });
    const at = await p.probe();
    await p.heading(at.bushYaw);
    const same = (r: { bushX: number; bushZ: number }) => r.bushX === at.bushX && r.bushZ === at.bushZ;
    for (let pick = 0; pick < 8 && same(await p.probe()); pick += 1) await p.press("KeyE");
    await p.expect((r) => !same(r) && r.gathered > at.gathered, "picked clean, the bush is gone and the nearest is another");
    await p.wait(200_000);
    await p.expect((r) => !same(r), "three minutes on it has not grown back");
    await p.waitFor(same, { timeoutMs: 120_000, note: "it grows back at five minutes" });
    const back = await p.probe();
    await p.heading(back.bushYaw);
    await p.press("KeyE");
    await p.expect((r) => r.gathered > back.gathered, "the same bush picks again");
  },
});

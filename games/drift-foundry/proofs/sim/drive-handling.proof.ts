import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Throttle builds speed; steering swings the heading.
export default defineProof(game, {
  proves: ["racing.drive-handling"],
  state: "race",
  async play(p) {
    await p.waitFor((r) => r.phase === 1, { timeoutMs: 30_000, note: "in the race" });
    const start = await p.expect((r) => r.speed < 1, "standing at the start");
    await p.hold("KeyW", { ms: 2000 });
    await p.expect((r) => r.speed > 15, "the throttle got the cart rolling");
    await p.hold(["KeyW", "KeyD"], { ms: 800 });
    await p.expect((r) => Math.abs(r.heading - start.heading) > 0.1, "steering turned the cart");
  },
});

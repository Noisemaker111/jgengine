import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Checking out banks store credit and medal points: the corral's carts and the next tier of events get closer.
export default defineProof(game, {
  proves: ["racing.unlock-vehicles-tracks"],
  state: "race",
  setup(s) {
    s.command("cheat.drive", { toRun: 455 });
  },
  async play(p) {
    const before = await p.expect((r) => r.phase === 1 && r.points === 0, "no medals yet, near the tills");
    await p.hold("KeyW", { ms: 4000 });
    await p.waitFor((r) => r.phase === 3 && r.points > before.points && r.credits > before.credits, { timeoutMs: 6000, note: "the checkout banked credit toward a cart and medal points toward the next tier" });
  },
});

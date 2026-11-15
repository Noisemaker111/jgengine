import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Second 0 of a new run: the hanging sign names the goal (push off toward the tills) and holding the
// throttle moves the cart down the aisle toward it.
export default defineProof(game, {
  proves: ["onboarding.first-goal"],
  state: "race",
  async play(p) {
    await p.waitFor((r) => r.phase === 1 && r.goal === 1, { timeoutMs: 30_000, note: "the sign shows the first goal" });
    await p.expect((r) => r.run < 6, "the cart is still on the start line");
    await p.hold("KeyW", { ms: 2500 });
    await p.waitFor((r) => r.run > 10, { timeoutMs: 5000, note: "the push moved the cart down the aisle" });
  },
});

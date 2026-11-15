import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The three late shoppers race the aisle on their own, the standing cart falls to the back of the order.
export default defineProof(game, {
  proves: ["racing.opponents"],
  state: "race",
  async play(p) {
    const start = await p.waitFor((r) => r.phase === 1 && r.total === 4, { timeoutMs: 30_000, note: "a four-cart field on the grid" });
    await p.wait(8000);
    await p.expect((r) => r.rivalRun > start.rivalRun + 40, "the rivals pushed on down the aisle");
    await p.expect((r) => r.place === 4, "and the standing cart is last");
  },
});

import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Boot lands on customer service. Choosing Credits shows the credits pane; New run starts closing time.
export default defineProof(game, {
  proves: ["menu.start-and-credits"],
  state: "title",
  async play(p) {
    await p.expect((r) => r.phase === 0 && r.menuPane === 0, "customer service, on its default pane");
    await p.act("menu.pane", { pane: "credits" });
    await p.expect((r) => r.menuPane === 8, "the credits show");
    await p.act("startRun");
    await p.waitFor((r) => r.phase === 1 && r.car === 1, { timeoutMs: 30_000, note: "closing time starts: the cart is in the aisle" });
  },
});

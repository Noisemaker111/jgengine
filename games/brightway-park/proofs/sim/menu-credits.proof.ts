import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The page opens on the gate board. Credits shows the credits pane; Wake the haunt starts the first
// scenario on the empty lot and the board steps aside.
export default defineProof(game, {
  proves: ["menu.start-and-credits"],
  state: "title",
  async play(p) {
    await p.expect((r) => r.onTitle === 1 && r.menuPane === 0, "the gate board, on its main pane");
    await p.act("menu.pane", { pane: "credits" });
    await p.expect((r) => r.menuPane === 3, "the credits show");
    await p.act("start");
    await p.waitFor((r) => r.onTitle === 0 && r.menuPane === 0 && r.structures === 2 && r.hint === 0, { timeoutMs: 3000, note: "the first scenario opens on the empty lot with its first hint, the board gone" });
  },
});

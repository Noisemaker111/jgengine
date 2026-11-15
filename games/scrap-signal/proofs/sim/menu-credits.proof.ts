import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The page opens on the title broadcast. Credits shows the credits; starting from the title drops
// the first tinkerer by the school bus with DING in sight.
export default defineProof(game, {
  proves: ["menu.start-and-credits"],
  state: "title",
  async play(p) {
    await p.waitFor((r) => r.phase === 0, { timeoutMs: 10_000, note: "the title" });
    await p.expect((r) => r.menuPane === 0, "the title, on its default screen");
    await p.act("menu.pane", { pane: "credits" });
    await p.expect((r) => r.menuPane === 3, "the credits show");
    await p.act("start");
    await p.waitFor((r) => r.phase === 1 && r.health > 0, { timeoutMs: 10_000, note: "the game starts in Crabgrass Court" });
    await p.expect((r) => r.menuPane === 0 && r.goalKind === 0, "the credits closed, and the marker points at DING");
  },
});

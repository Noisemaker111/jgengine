import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The page opens on the title. Credits shows the credits screen; starting from the title puts the
// Little in the burrow, ready to slip out.
export default defineProof(game, {
  proves: ["menu.start-and-credits"],
  state: "title",
  async play(p) {
    await p.waitFor((r) => r.phase === 0, { timeoutMs: 10_000, note: "the title" });
    await p.expect((r) => r.menuPane === 0, "the title, on its default screen");
    await p.act("menu.pane", { pane: "credits" });
    await p.expect((r) => r.menuPane === 3, "the credits show");
    await p.act("start");
    await p.waitFor((r) => r.phase === 1 && r.home === 1, { timeoutMs: 10_000, note: "the game starts in the burrow" });
    await p.expect((r) => r.menuPane === 0, "the credits closed with the title");
  },
});

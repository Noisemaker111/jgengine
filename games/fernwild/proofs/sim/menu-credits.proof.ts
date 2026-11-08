import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The page opens on the title. Play highlights Credits there, which shows the credits pane, and starts a game from
// the title, which enters play with the survivor on the beach.
export default defineProof(game, {
  proves: ["menu.start-and-credits"],
  state: "title",
  async play(p) {
    await p.expect((r) => r.phase === 0 && r.menuPane === 0, "the title, on its default pane");
    await p.act("menu.pane", { pane: "credits" });
    await p.expect((r) => r.menuPane === 3, "the credits show");
    await p.act("start");
    await p.waitFor((r) => r.phase === 1 && r.health > 0, { timeoutMs: 60_000, note: "the game starts: the survivor is on the beach" });
    await p.expect((r) => r.menuPane === 0, "the title's credits close with it");
  },
});

import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { atDoor } from "./scenarios";

/**
 * The rider delivers a box and saves from the pause phone. Quitting and opening the game again lands on
 * the title with the delivery still on the books, and Continue drops back into the run.
 */
export default defineProof(game, {
  proves: ["save.continue"],
  setup: (s) => atDoor(s),
  async play(p) {
    await p.expect((r) => r["delivered"] === 0, "nothing delivered yet");
    await p.press("KeyE");
    const paid = await p.expect((r) => r["delivered"] === 1, "the first box is delivered");
    await p.act("session.save");
    await p.wait(500);
    await p.restart("title");
    await p.waitFor((r) => r["started"] === 0 && r["delivered"] === 1, { timeoutMs: 5000, note: "a new session opens on the title with the save loaded" });
    await p.act("game.start");
    await p.expect((r) => r["started"] === 1 && r["delivered"] === 1 && r["cash"] === paid["cash"], "Continue is back in the run with the delivery and its pay");
  },
});

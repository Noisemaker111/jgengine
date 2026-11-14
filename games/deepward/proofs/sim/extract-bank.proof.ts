import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { carrying, crack, outInTheHouse } from "./scenarios";

// Back at the crack with a button and a marble in the pack: E squeezes home and banks both.
export default defineProof(game, {
  proves: ["extraction.extract-bank"],
  async setup(s) {
    await outInTheHouse(s);
    carrying(s, ["button", "marble"]);
    const at = crack(s);
    s.teleport({ x: at[0], z: at[2], y: 0 });
  },
  async play(p) {
    await p.expect((r) => r.inRun === 1 && r.carried === 2 && r.stash === 0, "carrying two finds, nothing banked yet");
    await p.act("deepward.interact");
    await p.waitFor((r) => r.returning === 1, { timeoutMs: 6000, note: "squeezed through the crack" });
    // The save sheet's button; the write lands between frames.
    await p.act("deepward.retrySave");
    await p.waitFor((r) => r.home === 1, { timeoutMs: 2000, note: "home in the burrow" });
    await p.expect((r) => r.stash === 2 && r.extractions === 1, "both finds are on the stash shelves");
  },
});

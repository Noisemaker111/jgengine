import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { atCrack } from "./scenarios";

// A new burrow's card says: slip out through the crack and come back the way you came. Doing exactly
// that moves the card on to the next goal (build the larder).
export default defineProof(game, {
  proves: ["onboarding.first-goal"],
  async setup(s) { await atCrack(s); },
  async play(p) {
    await p.expect((r) => r.goal === 0 && r.extractions === 0, "a new burrow points at its first run");
    await p.act("deepward.interact");
    await p.waitFor((r) => r.inRun === 1, { timeoutMs: 3000, note: "out through the crack" });
    // You arrive beside the crack: the same E takes you straight back home.
    await p.act("deepward.interact");
    await p.waitFor((r) => r.returning === 1, { timeoutMs: 4000, note: "squeezing home" });
    await p.act("deepward.retrySave");
    await p.waitFor((r) => r.home === 1, { timeoutMs: 2000, note: "home" });
    await p.expect((r) => r.goal === 1 && r.extractions === 1, "the burrow's card moved on to the next goal");
  },
});

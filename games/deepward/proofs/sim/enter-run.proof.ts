import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { atCrack } from "./scenarios";

// Standing at the crack in the burrow wall, E slips the chosen Little out into tonight's house.
export default defineProof(game, {
  proves: ["extraction.enter-run"],
  async setup(s) { await atCrack(s); },
  async play(p) {
    await p.expect((r) => r.home === 1 && r.inRun === 0, "in the burrow");
    // E on the crack (the prompt's button runs the same command).
    await p.act("deepward.interact");
    await p.waitFor((r) => r.inRun === 1, { timeoutMs: 5000, note: "out in the house" });
    await p.expect((r) => r.depth === 0 && r.health > 0 && r.elapsed < 5, "the run starts at the crack at 3 AM");
  },
});

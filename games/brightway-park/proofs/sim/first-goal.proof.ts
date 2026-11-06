import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { click } from "./scenarios";

export default defineProof(game, {
  proves: ["onboarding.first-goal"],
  async play(p) {
    await p.expect((r) => r.taught === 0 && r.rides === 0, "second 0: an empty lot, the first hint still to do");
    // The hint says to lay a path in from the gate: the path key, then cells north of the plaza.
    await p.press("Digit6");
    for (const z of [44, 40, 36, 32]) await p.act("park.pointer", click(0, z));
    await p.waitFor((r) => r.taught >= 1, { timeoutMs: 3000, note: "the path step is done" });
  },
});

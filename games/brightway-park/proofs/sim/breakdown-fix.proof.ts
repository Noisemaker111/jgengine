import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { click, parkOpen } from "./scenarios";

export default defineProof(game, {
  proves: ["tycoon.breakdowns"],
  setup(s) {
    parkOpen(s);
    // The carousel runs, fast-forwarded, until it wears out and breaks on its own.
    s.timeScale(60);
    s.waitFor((p) => p.ridesDown > 0, { timeoutMs: 1_200_000 });
  },
  async play(p) {
    // Nothing fixes it on its own.
    await p.wait(10_000);
    await p.expect((r) => r.ridesDown > 0, "the carousel is still down with no mechanic");
    // Hire a mechanic from the Staff palette; they go to the ride and fix it.
    await p.act("build.select", { id: "staff_mechanic" });
    await p.act("park.pointer", click(-12, 36));
    await p.expect((r) => r.staffHired === 1, "a mechanic is hired");
    await p.waitFor((r) => r.ridesDown === 0, { timeoutMs: 120_000, note: "the mechanic walks to the carousel and fixes it" });
  },
});

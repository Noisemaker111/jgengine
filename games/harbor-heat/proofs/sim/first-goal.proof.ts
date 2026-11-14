import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { OVEN } from "../../src/game/pizza/shift";

/** A new rider walks from the spawn to the oven window, sleeps till the doors open and loads the first box. */
export default defineProof(game, {
  proves: ["onboarding.first-goal"],
  async play(p) {
    const start = await p.expect((r) => Number(r["chapterSteps"]) >= 1 && Number(r["bag"]) === 0, "the first chapter is live and the bag is empty");
    await p.heading(Math.atan2(OVEN[0] - Number(start["x"]), OVEN[1] - Number(start["z"])));
    await p.hold("KeyW", { until: (r) => Math.hypot(Number(r["x"]) - OVEN[0], Number(r["z"]) - OVEN[1]) < 4, timeoutMs: 15_000 });
    await p.press("KeyE");
    await p.waitFor((r) => r["open"] === 1, { timeoutMs: 5000, note: "the rider sleeps till the doors open" });
    await p.waitFor((r) => Number(r["board"]) > 0, { timeoutMs: 20_000, note: "the first order rings" });
    await p.press("KeyE");
    await p.expect((r) => Number(r["bag"]) > 0, "the first box is in the bag");
  },
});

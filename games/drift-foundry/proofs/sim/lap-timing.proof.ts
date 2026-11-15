import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The lap clock runs from the start line, and crossing the self-checkout completes the lap.
export default defineProof(game, {
  proves: ["racing.lap-timing"],
  state: "race",
  setup(s) {
    s.command("cheat.drive", { toRun: 455 });
  },
  async play(p) {
    const before = await p.expect((r) => r.phase === 1 && r.finished === 0 && r.lapTime > 0, "a timed lap under way, short of the tills");
    await p.hold("KeyW", { ms: 4000 });
    await p.waitFor((r) => r.phase === 3, { timeoutMs: 6000, note: "through the self-checkout" });
    await p.expect((r) => r.finished === 1, "the lap is complete");
    await p.expect((r) => r.finishTime >= before.lapTime, "with its lap time on the receipt");
  },
});

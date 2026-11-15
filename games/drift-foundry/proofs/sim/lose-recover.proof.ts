import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Stand still and the shutters lock you in: the run's haul is lost. Restart puts a fresh cart at the doors.
export default defineProof(game, {
  proves: ["failure.lose-and-recover"],
  state: "race",
  setup(s) {
    s.command("cheat.drive", { toRun: 60 });
  },
  async play(p) {
    const before = await p.expect((r) => r.phase === 1 && r.atRisk > 0, "the cart carries a haul, the shutters behind");
    await p.waitFor((r) => r.phase === 4, { timeoutMs: 60_000, note: "standing still, the shutters locked the cart in" });
    await p.expect((r) => r.runs === before.runs + 1 && r.atRisk === 0, "the haul is gone with the run");
    await p.act("restart");
    await p.waitFor((r) => r.phase === 1 && r.run < 6 && r.gap > 30, { timeoutMs: 5000, note: "a fresh cart at the doors with the shutters well back" });
  },
});

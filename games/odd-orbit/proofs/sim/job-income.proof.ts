import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Setup sends Krrt off for a nap so the one Gig Terminal is free; the player starts Pip-9's gig
// shift from its card and the jar fills.
export default defineProof(game, {
  proves: ["life.job-income"],
  setup(s) {
    s.command("member.direct", { id: "alien:0", goal: "energy" });
  },
  async play(p) {
    const before = await p.probe();
    await p.act("member.direct", { id: "alien:3", goal: "work" });
    await p.waitFor((r) => r.credits > before.credits + 20, { timeoutMs: 60_000, note: "Pip-9's gig shift pays into the jar" });
  },
});

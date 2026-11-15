import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Pip-9's Snack need falls as the day runs; sending Pip-9 to the Galley Counter refills it.
export default defineProof(game, {
  proves: ["life.needs"],
  async play(p) {
    const start = await p.probe();
    await p.wait(20_000);
    const hungry = await p.expect((r) => r.pipSnack < start.pipSnack, "waiting drains Pip-9's Snack need");
    await p.act("member.direct", { id: "alien:3", goal: "hunger" });
    await p.waitFor((r) => r.pipSnack > hungry.pipSnack + 5, { timeoutMs: 40_000, note: "a meal at the Galley Counter refills it" });
  },
});

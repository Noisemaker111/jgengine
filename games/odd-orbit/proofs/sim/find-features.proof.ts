import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

/** The next-step note's kinds, in `GUIDE_KINDS` order. */
const APPLICANT = 0, MISERABLE = 1, LEAK = 2, SPARE_ROOM = 3, WORK_STATION = 4, BILL = 5, PANTRY = 6;

// A new house follows only the next-step note. It names Krrt smelling Glorp's swamp gas (seal the
// wall), then Glorp smelling the oxygen next door (seal that one), then the empty room Pip-9 could
// have (give Pip-9 its door). With the house settled the note says to keep everyone comfy, and the
// first rent night comes in: cheques, reviews and the station's reputation all move. Each core
// feature — sealing a wall, moving a tenant, rent night with its reviews — gets its first use.
export default defineProof(game, {
  proves: ["onboarding.find-features"],
  async play(p) {
    await p.expect((r) => r.sealed === 0 && r.pipRoom === -1 && r.reviews === 0, "a new house, nothing done");
    for (let step = 0; step < 12; step += 1) {
      const r = await p.probe();
      if (r.guide === LEAK) await p.act("room.seal", { slot: r.guideSlot });
      else if (r.guide === SPARE_ROOM) await p.act("room.move", { id: "alien:3", slot: r.guideSlot });
      else if (r.guide === MISERABLE) await p.act("room.tune", { slot: r.guideSlot });
      else if (r.guide === APPLICANT) await p.act("applicant.accept", { slot: r.guideSlot });
      else if (r.guide === WORK_STATION) await p.act("build.tool", { toolId: "work_console" });
      else if (r.guide === PANTRY) await p.act("household.rations", {});
      else if (r.guide === BILL) break;
      else break;
    }
    await p.expect((r) => r.sealed >= 1 && r.pipRoom >= 0, "the note led to a sealed wall and Pip-9's door");
    await p.waitFor((r) => r.reviews > 0 && r.day >= 1, { timeoutMs: 300_000, note: "the first rent night brings cheques and reviews" });
    await p.expect((r) => r.reputation !== 50, "the reviews moved the station's reputation");
  },
});

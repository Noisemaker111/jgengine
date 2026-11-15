import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Opening night: the lease's first goal is four tenants comfortable at once, and only three have a
// room. Giving Pip-9 the empty room (the next-step note's own advice) moves the goal to four.
export default defineProof(game, {
  proves: ["onboarding.first-goal"],
  async play(p) {
    await p.expect((r) => r.term === 0 && r.housed === 3 && r.comfy === 3 && r.pipRoom === -1, "second 0: three of four comfortable, Pip-9 in the cupboard");
    await p.act("room.move", { id: "alien:3", slot: 3 });
    await p.expect((r) => r.pipRoom === 3 && r.comfy === 4, "Pip-9 has a door and the first goal reads four of four");
  },
});

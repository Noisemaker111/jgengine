import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { householdStore } from "../../src/game/session/store";

// A broke house with an empty galley: nobody can eat. The station food bank sends four rations at a
// stated cost of 40 credits of debt, which the next docking bill starts repaying.
export default defineProof(game, {
  proves: ["failure.lose-and-recover"],
  setup(s) {
    householdStore.update(s.ctx, (state) => ({ ...state, credits: 0, pantry: 0 }));
  },
  async play(p) {
    await p.expect((r) => r.pantry === 0 && r.debt === 0 && r.credits === 0, "broke, the galley empty");
    await p.act("household.relief", {});
    await p.expect((r) => r.pantry === 4 && r.debt === 40, "four rations from the food bank, 40 credits owed");
  },
});

import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

export default defineProof(game, {
  proves: ["survival.vitals-drain"],
  async play(p) {
    await p.hold("KeyW", { ms: 2000 });
    await p.wait(180_000);
    await p.expect((r) => r.food < 100 && r.water < 100, "three minutes on, food and water have fallen");
  },
});

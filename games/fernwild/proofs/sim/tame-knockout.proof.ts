import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { raptorAhead } from "./scenarios";

export default defineProof(game, {
  proves: ["taming.knockout-melee"],
  setup: (s) => raptorAhead(s),
  async play(p) {
    await p.hold("mouse0", { until: (r) => r.aimedDown === 1, timeoutMs: 30_000 });
    await p.hold("KeyE", { until: (r) => r.screen === 1, timeoutMs: 3000 });
    await p.act("giveCreature", { inventoryId: "inventory", slot: (await p.probe()).foodSlot });
    await p.waitFor((r) => r.tamed === 1, { timeoutMs: 45_000, note: "tamed" });
  },
});

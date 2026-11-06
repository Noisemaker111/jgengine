import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { parkOpen } from "./scenarios";

export default defineProof(game, {
  proves: ["tycoon.unlock-research"],
  setup: (s) => parkOpen(s),
  async play(p) {
    const before = await p.probe();
    // The Lab panel's Ice Cream Cart topic.
    await p.act("brightway.act", { action: "research_stall_icecream" });
    await p.waitFor((r) => r.shopsSeen > before.shopsSeen && r.researched > before.researched, { timeoutMs: 180_000, note: "the ice cream cart unlocks" });
  },
});

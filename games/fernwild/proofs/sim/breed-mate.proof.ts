import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { raptorPair } from "./scenarios";

export default defineProof(game, {
  proves: ["breeding.pair-mate"],
  setup: (s) => raptorPair(s),
  async play(p) {
    await p.waitFor((r) => r.mating === 1, { timeoutMs: 5000, note: "the pair mates" });
    await p.waitFor((r) => r.eggs >= 1, { timeoutMs: 75_000, note: "an egg is laid" });
  },
});

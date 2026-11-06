import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { raptorPair } from "./scenarios";

export default defineProof(game, {
  proves: ["breeding.incubate"],
  setup(s) {
    raptorPair(s);
    s.waitFor((p) => p.eggs >= 1, { timeoutMs: 80_000 });
    s.command("cheat", { give: { campfire: 1 }, toHotbar: ["campfire"], breedingSpeed: 1000 });
  },
  async play(p) {
    await p.expect((r) => r.eggTemperature < 20, "the night is too cold for the egg");
    await p.press("Digit1");
    await p.hold("mouse0", { until: (r) => r.eggTemperature >= 20 && r.eggTemperature <= 28, ms: 80, timeoutMs: 3000 });
    await p.waitFor((r) => r.babies >= 1, { timeoutMs: 30_000, note: "warmed by the campfire, it hatches" });
  },
});

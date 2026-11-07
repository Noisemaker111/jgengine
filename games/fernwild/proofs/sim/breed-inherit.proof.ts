import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { raptorPair } from "./scenarios";

// A baby takes each stat whole from one parent, its card says which, and a mutation can raise one. Setup mates two level 20 raptors
// whose wild levels were rolled apart, with every mutation roll made certain (ARK's 2.5% would take dozens of
// babies to show one), until their egg is laid, and hands over a campfire to hatch it by.
export default defineProof(game, {
  proves: ["breeding.inherit-mutate"],
  setup(s) {
    raptorPair(s);
    s.command("cheat", { mutationChance: 1 });
    s.waitFor((p) => p.eggs >= 1, { timeoutMs: 80_000 });
    s.command("cheat", { give: { campfire: 1, wood: 10 }, toHotbar: ["campfire"], breedingSpeed: 1000 });
  },
  async play(p) {
    await p.press("Digit1");
    await p.hold("mouse0", { until: (r) => r.fuel >= 0, ms: 80, timeoutMs: 3000 });
    for (let wood = 0; wood < 4; wood += 1) await p.press("KeyE");
    await p.waitFor((r) => r.babies >= 1, { timeoutMs: 30_000, note: "warmed by the campfire, the egg hatches" });
    await p.expect((r) => r.babyStrays === 0, "every stat it has is one parent's levels, mutations taken off");
    await p.expect((r) => r.babyFromMother + r.babyFromFather >= 1, "its card names the parent of each stat the two did not share");
    await p.expect((r) => r.babyMutated >= 1, "and marks a stat a mutation raised past its parent's");
  },
});

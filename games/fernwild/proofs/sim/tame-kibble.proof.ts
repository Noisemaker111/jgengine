import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { timeTame, turnAround, twoRaptorsDown } from "./scenarios";

// Cook two Simple Kibble in a cooking pot from small eggs (a level-1 raptor eats two), then tame one raptor
// on them and one on raw prime meat, the best food a raptor finds raw: the kibble wins.
export default defineProof(game, {
  proves: ["taming.crafted-bait"],
  setup(s) {
    twoRaptorsDown(s, { egg_s: 2, mejoberry: 10, cooked_meat: 2, fiber: 20, raw_prime_meat: 10 });
    s.command("cheat", { give: { cooking_pot: 1, wood: 10 }, toHotbar: ["cooking_pot"] });
  },
  async play(p) {
    // The pot goes down to the side, clear of the raptor in front, and cold: wood under it lights it.
    const facing = (await p.probe()).yaw;
    await p.heading(facing + Math.PI / 2);
    await p.press("Digit1");
    await p.hold("mouse0", { until: (r) => r.fuel >= 0, ms: 80, timeoutMs: 3000 });
    for (let wood = 0; wood < 6; wood += 1) await p.press("KeyE");
    await p.expect((r) => r.fuel > 150, "six wood under the pot");
    await p.heading(facing);
    await p.act("craft", { recipeId: "cook_kibble_simple", count: 2 });
    await p.waitFor((r) => r.kibble >= 2, { timeoutMs: 90_000, note: "the pot cooks two Simple Kibble" });
    await p.expect((r) => r.eggsCarried === 0, "the eggs went into them");
    const bait = await timeTame(p, (r) => r.kibbleSlot, 0);
    await turnAround(p);
    const raw = await timeTame(p, (r) => r.primeSlot, 1);
    await p.expect(() => bait.seconds < raw.seconds, `kibble tamed in ${bait.seconds}s, prime meat in ${raw.seconds}s`);
  },
});

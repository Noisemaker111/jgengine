import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { atDoor } from "./scenarios";

/** A box straight from the oven, at its customer's door: handing it over pays the price and a heat-scaled tip. */
export default defineProof(game, {
  proves: ["open-world.jobs-pay", "delivery.deliver-fresh"],
  setup: (s) => atDoor(s),
  async play(p) {
    const before = await p.expect((r) => Number(r["bag"]) > 0 && Number(r["takings"]) === 0, "a hot box in the bag and nothing taken tonight");
    await p.press("KeyE");
    await p.expect((r) => Number(r["cash"]) > Number(before["cash"]) && Number(r["takings"]) > 0 && Number(r["bag"]) === 0, "the customer paid and the bag is empty");
  },
});

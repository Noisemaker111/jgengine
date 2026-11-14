import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { clockTo, loaded, portDock } from "./scenarios";

/** A box in the bag, on the dock's jet-ski at high water: swapping back to the scooter keeps the box. */
export default defineProof(game, {
  proves: ["delivery.vehicle-swap"],
  setup(s) {
    loaded(s);
    clockTo(s, 21);
    const [x, z] = portDock();
    s.teleport({ x, z });
    s.command("pizza.swap");
    s.waitFor((r) => r["medium"] === 2, { timeoutMs: 1000, note: "on the dock's jet-ski" });
  },
  async play(p) {
    const before = await p.expect((r) => r["medium"] === 2 && Number(r["bag"]) > 0, "on the jet-ski with a box aboard");
    await p.press("KeyE");
    await p.expect((r) => r["medium"] === 1 && r["bag"] === before["bag"] && Number(r["swaps"]) > Number(before["swaps"]), "on the scooter, the box still in the bag");
  },
});

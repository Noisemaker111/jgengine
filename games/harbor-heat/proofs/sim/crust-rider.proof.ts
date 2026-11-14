import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { buyUpgrade } from "../../src/game/pizza/pizzeria";
import { pizzeriaStore, shiftStore } from "../../src/game/pizza/shift";
import { clockTo } from "./scenarios";

/** Two boxes stacked and a rider who stops in the street: a Carmine's Crust rider comes and takes the hottest. */
export default defineProof(game, {
  proves: ["delivery.rival-steal"],
  setup(s) {
    clockTo(s, 18.4);
    s.teleport({ x: -150, z: 20 });
    pizzeriaStore.write(s.ctx, buyUpgrade(pizzeriaStore.read(s.ctx), "oven"));
    const box = { customerId: "gus", pizzaId: "margherita", heat: 90, soak: 0, age: 5, par: 60 };
    shiftStore.write(s.ctx, { ...shiftStore.read(s.ctx), bag: [{ ...box, id: "p1" }, { ...box, id: "p2", heat: 70 }], rivalIn: 2, nextCallIn: 999 });
  },
  async play(p) {
    await p.expect((r) => r["bag"] === 2 && r["lost"] === 0, "two boxes stacked, none lost");
    await p.waitFor((r) => r["lost"] === 1, { timeoutMs: 30_000, note: "the Crust rider catches up and grabs a box" });
    await p.expect((r) => r["bag"] === 1, "one box left in the bag");
  },
});

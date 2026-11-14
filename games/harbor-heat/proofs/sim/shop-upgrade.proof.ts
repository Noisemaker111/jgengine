import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { UPGRADES } from "../../src/game/pizza/pizzeria";
import { atOven } from "./scenarios";

/** Tips in hand at the oven window: the books sell a second oven, and the bag holds two. */
export default defineProof(game, {
  proves: ["delivery.shop-upgrade"],
  setup(s) {
    atOven(s);
    s.ctx.game.economy.grant(s.userId, "cash", 2000);
  },
  async play(p) {
    const before = await p.expect((r) => r["oven"] === 1, "Nonna's one old oven");
    await p.act("pizzeria.open");
    await p.act("pizzeria.upgrade", { kind: "oven" });
    await p.expect((r) => r["oven"] === 2 && Number(r["cash"]) === Number(before["cash"]) - UPGRADES.oven.tiers[1]!.cost, "a second deck oven, paid for at its board price");
  },
});

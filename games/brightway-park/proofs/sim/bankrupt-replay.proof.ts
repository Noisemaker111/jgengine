import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { MONTH_DAYS } from "../../src/game/books";
import { DAY_LENGTH } from "../../src/game/catalog";
import { carouselBuilt, click } from "./scenarios";

export default defineProof(game, {
  proves: ["tycoon.bankrupt", "failure.lose-and-recover"],
  setup(s) {
    carouselBuilt(s);
    // A payroll the shut park cannot pay: mechanics hired from the palette until the till is nearly empty.
    for (const x of [-24, -20, -16, -12]) {
      for (const z of [20, 24, 28, 32, 36, 40, 44]) {
        if (s.probe().cash < 1200) break;
        s.command("build.select", { id: "staff_mechanic" });
        s.command("park.pointer", click(x, z));
      }
    }
    // Fast-forward through the first month (closed in the red) to the last day of the second.
    s.timeScale(120);
    s.waitFor((p) => p.day === 2 * MONTH_DAYS, { timeoutMs: DAY_LENGTH * 2 * MONTH_DAYS * 1000 });
    s.waitFor((p) => p.cash < 0, { timeoutMs: 1000 });
  },
  async play(p) {
    await p.waitFor((r) => r.gameOver === 1, { timeoutMs: (DAY_LENGTH + 10) * 1000, note: "the second red month-end closes the park" });
    await p.expect((r) => r.cash < 0, "closed with the till in the red");
    // The result screen's Play again: the scenario starts over from its own starting cash, the park lost.
    await p.act("park.replay");
    await p.expect((r) => r.gameOver === 0 && r.cash > 0 && r.rides === 0 && r.staffHired === 0, "back in play on an empty lot: the park was the cost");
  },
});

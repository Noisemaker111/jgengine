import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { atOven, clockTo } from "./scenarios";

/**
 * The last minutes of a shift with nothing taken: midnight closes it short of MegaSlice's quota (the
 * pressure rises, the stated cost), and sleeping puts the rider back behind an open counter.
 */
export default defineProof(game, {
  proves: ["delivery.shift-pay", "failure.lose-and-recover"],
  setup(s) {
    atOven(s);
    clockTo(s, 23.9);
    s.waitFor((r) => r["open"] === 1, { timeoutMs: 2000, note: "the shop is open in its last minutes" });
  },
  async play(p) {
    await p.expect((r) => r["shiftOver"] === 0, "the shift is still running");
    await p.waitFor((r) => r["shiftOver"] === 1, { timeoutMs: 30_000, note: "midnight closes the shift" });
    await p.expect((r) => r["quotaMet"] === 0, "short of MegaSlice's quota");
    await p.act("shift.sleep");
    await p.expect((r) => r["open"] === 1 && r["shiftOver"] === 0, "back behind the counter as the doors open");
  },
});

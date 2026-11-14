import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { carrying, firstFind, outInTheHouse } from "./scenarios";

// Two coins and two screws fill every square of the pack: the next find is turned away.
export default defineProof(game, {
  proves: ["extraction.carry-limit"],
  async setup(s) {
    await outInTheHouse(s);
    carrying(s, ["coin", "coin", "screw", "screw"]);
    const at = firstFind(s);
    s.teleport({ x: at[0] + 0.4, z: at[2] + 0.4, y: 0 });
  },
  async play(p) {
    const before = await p.expect((r) => r.carried === 4 && r.refusals === 0, "a full pack beside a find");
    await p.act("deepward.interact");
    await p.wait(1500);
    await p.expect((r) => r.refusals > before.refusals && r.carried === 4, "the find did not fit and stayed where it was");
  },
});

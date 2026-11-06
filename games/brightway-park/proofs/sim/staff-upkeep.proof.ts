import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { click, layPath } from "./scenarios";

export default defineProof(game, {
  proves: ["tycoon.staff-upkeep"],
  // A path and nothing else, the gate shut: no takings to hide what wages cost.
  setup: (s) => layPath(s),
  async play(p) {
    await p.act("build.select", { id: "staff_janitor" });
    await p.act("park.pointer", click(-12, 36));
    const hired = await p.expect((r) => r.staffHired === 1, "a handyman is on the payroll");
    await p.wait(30_000);
    await p.expect((r) => r.cash < hired.cash, "wages leave the balance by the second");
  },
});

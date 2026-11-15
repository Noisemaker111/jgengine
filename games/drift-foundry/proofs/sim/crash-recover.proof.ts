import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Setup noses the cart into the soda-pallet ramp without hopping: it is stopped dead. Backing off and
// hopping on the run-up gets it over and on down the aisle.
export default defineProof(game, {
  proves: ["racing.crash-recover"],
  state: "race",
  setup(s) {
    s.command("cheat.drive", { toRun: 135 });
    s.hold("KeyW", { ms: 2500 });
    s.waitFor((r) => r.blocked === 1, { timeoutMs: 3000 });
  },
  async play(p) {
    await p.expect((r) => r.blocked === 1 && r.run < 151, "stopped at the pallet ramp");
    await p.hold("KeyS", { until: (r) => r.run < 128, ms: 6000 });
    await p.hold("KeyW", { ms: 2500 });
    await p.press("Space");
    await p.hold("KeyW", { ms: 2000 });
    await p.waitFor((r) => r.run > 156, { timeoutMs: 4000, note: "over the ramp and rolling on" });
  },
});

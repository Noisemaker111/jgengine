import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** The vital icons on a fresh survivor after a run, then H for the numbers under them. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    await f.hold(["KeyW", "ShiftLeft"], { ms: 4000 });
    await f.expect((p) => p.stamina < 100, "running spent stamina");
    await f.shot("vitals");
    await f.press("KeyH");
    await f.see("Stamina");
    await f.shot("vitals-detail");
  },
});

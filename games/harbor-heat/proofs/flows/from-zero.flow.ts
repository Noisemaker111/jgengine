import { defineFlow } from "@jgengine/core/play/flow";

import { game } from "../../src/game.config";

/** One stride of walking between looks at the map. */
const STEP_MS = 500;
/** Inside the courier prompt's radius (9 m at the booth, 8 at the drop). */
const REACH = 6;
/** The first parcel's clock is a minute or two; past this the delivery never landed. */
const MAX_STEPS = 1200;

/**
 * A new driver's first job in Harbor Heat, played on foot the way the dispatch poster reads: walk to
 * the dispatch booth, press E for a standard parcel, run it to the drop the job points at and press E
 * to hand it over, then run down the runner who grabs it there, until the courier pays out.
 */
export default defineFlow(game, {
  async run(f) {
    const start = await f.expect((p) => p.delivered === 0 && p.driving === 0 && p.courierDistance >= 0, "a new game on foot beside the dispatch booth, nothing delivered");
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const p = await f.probe();
      if (p.delivered > start.delivered) break;
      if (p.runnerDistance >= 0) {
        // A runner grabbed the parcel at the drop: run them down before they get away.
        await f.heading(Math.atan2(p.runnerX - p.x, p.runnerZ - p.z));
        await f.hold(["ShiftLeft", "KeyW"], { ms: STEP_MS / 2 });
        continue;
      }
      if (p.courierDistance < 0) {
        await f.wait(STEP_MS);
        continue;
      }
      if (p.courierDistance <= REACH) {
        await f.press("KeyE");
        await f.wait(STEP_MS);
        continue;
      }
      await f.heading(Math.atan2(p.courierX - p.x, p.courierZ - p.z));
      await f.hold(p.courierDistance > 20 ? ["ShiftLeft", "KeyW"] : ["KeyW"], { ms: STEP_MS });
    }
    await f.expect((p) => p.delivered >= 1, "the first parcel is delivered and paid");
  },
});

import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import { customerSpot, OVEN } from "../../src/game/pizza/shift";

/**
 * A new rider from nothing, through real input only: walk to the oven window, sleep till the doors open,
 * load the first order (the Okafor twins, a short walk across the boardwalk), carry both of their pies
 * over one at a time, then let the rest of the first night run to last orders and sleep into the second.
 * No teleports, no cheats, no clock scaling.
 */
const MARKET = customerSpot("okafor_twins")!;

type Probe = { x: number; z: number };
const near = (p: Probe, at: readonly [number, number], metres: number) => Math.hypot(p.x - at[0], p.z - at[1]) < metres;

export default defineFlow(game, {
  async run(f) {
    const start = await f.expect((p) => p.bag === 0 && p.open === 0 && p.chapterSteps >= 1, "second 0: the first chapter is live, the shop not yet open, the bag empty");

    // To the oven window and a nap until six.
    await f.heading(Math.atan2(OVEN[0] - start.x, OVEN[1] - start.z));
    await f.hold("KeyW", { until: (p) => near(p, OVEN, 4), timeoutMs: 15_000 });
    await f.press("KeyE");
    await f.waitFor((p) => p.open === 1, { timeoutMs: 5000, note: "Vell's opens" });

    for (let box = 1; box <= 2; box += 1) {
      await f.waitFor((p) => p.board > 0, { timeoutMs: 30_000, note: `the twins' order is on the board (box ${box})` });
      await f.press("KeyE");
      const loaded = await f.expect((p) => p.bag === 1, `box ${box} is in the bag`);
      // Across the boardwalk to the twins' stall.
      await f.heading(Math.atan2(MARKET[0] - loaded.x, MARKET[1] - loaded.z));
      await f.hold("KeyW", { until: (p) => near(p, MARKET, 5), timeoutMs: 20_000 });
      await f.press("KeyE");
      const paid = await f.expect((p) => p.bag === 0 && p.delivered === box, `box ${box} handed over`);
      if (box === 2) break;
      // Back to the oven for the second pie.
      await f.heading(Math.atan2(OVEN[0] - paid.x, OVEN[1] - paid.z));
      await f.hold("KeyW", { until: (p) => near(p, OVEN, 4), timeoutMs: 20_000 });
    }
    await f.expect((p) => p.takings > 0 && p.cash > start.cash, "the first night's takings are in the till");

    // The rest of the night runs to last orders, and the rider sleeps into the second.
    await f.waitFor((p) => p.shiftOver === 1, { timeoutMs: 420_000, note: "midnight closes the first shift" });
    await f.command("shift.sleep");
    await f.waitFor((p) => p.open === 1 && p.shiftOver === 0, { timeoutMs: 2000, note: "night two: the doors are open again" });
  },
});

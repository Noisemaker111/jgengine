import { defineProof } from "@jgengine/core/suite/suiteProof";
import type { ProofPlay } from "@jgengine/core/suite/suiteProof";
import type { ProbeReadings } from "@jgengine/core/game/playableGame";

import { game } from "../../src/game.config";

/** Walk to wherever the pager points, as a player reading the arrow does. */
async function followPager(p: ProofPlay<ProbeReadings>, within = 4): Promise<void> {
  const at = await p.probe();
  const gx = Number(at["goalX"]);
  const gz = Number(at["goalZ"]);
  await p.heading(Math.atan2(gx - Number(at["x"]), gz - Number(at["z"])));
  await p.hold("KeyW", { until: (r) => Math.hypot(Number(r["x"]) - gx, Number(r["z"]) - gz) < within, timeoutMs: 25_000 });
}

/**
 * A new rider who only follows the pager and the HUD reaches every core feature's first use: the shift
 * (the oven window's nap), loading an order, delivering it, the city phone with Nonna's chapters, and the
 * shop's books.
 */
export default defineProof(game, {
  proves: ["onboarding.find-features"],
  async play(p) {
    await p.expect((r) => r["open"] === 0 && r["bag"] === 0 && r["delivered"] === 0 && r["phone"] === 0 && r["books"] === 0, "a new game: nothing used yet");
    await followPager(p);
    await p.press("KeyE");
    await p.waitFor((r) => r["open"] === 1, { timeoutMs: 5000, note: "the shift: Vell's opens" });
    await p.waitFor((r) => Number(r["board"]) > 0, { timeoutMs: 30_000, note: "the first order rings" });
    await p.press("KeyE");
    await p.expect((r) => Number(r["bag"]) > 0, "loading: the first box is in the bag");
    await followPager(p, 5);
    await p.press("KeyE");
    await p.expect((r) => Number(r["delivered"]) > 0, "delivering: the first box is handed over");
    await p.press("KeyT");
    await p.expect((r) => r["phone"] === 1, "the city phone, with Nonna's chapters on it");
    await p.press("KeyT");
    await followPager(p);
    await p.act("pizzeria.open");
    await p.expect((r) => r["books"] === 1, "the shop's books at the oven window");
  },
});

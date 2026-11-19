import { defineFlow } from "@jgengine/core/play/flow";

import { game } from "../../src/game.config";
import { HERO_ID } from "../../src/game/hero";

/** A commander glances at the treasury and the field about once a second. */
const LOOK_MS = 1000;
/** Where a Barracks goes: on the vale floor beside the keep. */
const BARRACKS_OFFSET = { x: 12, z: 6 };

/**
 * A new commander's first order, First Muster, played on the command card: arm a Barracks and set it
 * down beside the keep, train four Footmen as the gold comes in, then select Bram and send him to
 * the muster ground, until the mission is won.
 */
export default defineFlow(game, {
  async run(f) {
    const start = await f.expect((p) => p.won === 0 && p.barracks === 0, "a new campaign: nothing won, no Barracks yet, the opening line at the keep");
    // The Barracks: arm it from the card (B), click its spot on the vale floor once, and let the peasants raise it.
    await f.command("build.arm", { type: "barracks" });
    await f.command("unit.order", { point: [start.keepX + BARRACKS_OFFSET.x, 0, start.keepZ + BARRACKS_OFFSET.z] });
    await f.waitFor((p) => p.barracks >= 1, { timeoutMs: 300_000, note: "a Barracks stands on the vale floor" });
    // Four Footmen, one at a time as the treasury allows.
    for (let look = 0; look < 900; look += 1) {
      const p = await f.probe();
      if (p.footmen >= start.footmen + 4 || p.won >= 1) break;
      await f.tryCommand("train.footman", {});
      await f.wait(LOOK_MS * 3);
    }
    // Bram selected and ordered to the muster ground (the line may already have marched him there).
    const ready = await f.probe();
    if (ready.won === 0) await f.command("unit.order", { selection: [HERO_ID], point: [ready.musterX, 0, ready.musterZ] });
    await f.waitFor((p) => p.won >= 1, { timeoutMs: 180_000, note: "Bram reached the muster ground and First Muster is won" });
  },
});

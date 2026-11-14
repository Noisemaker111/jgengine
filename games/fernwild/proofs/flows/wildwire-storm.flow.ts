import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * A Signal Storm night on the south beach: wild machines Overclocked around the technician, the storm
 * banner up and the sky veiled. A shot for review once the scene settles.
 */
const SLOW = { timeoutMs: 120000 };

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.phase === 1 && p.health > 0, SLOW);
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    await f.command("cheat", { clock: 3600 * 0.9, storm: true });
    for (const [species, distance, side] of [["lodestone", 9, -3], ["lodestone", 10, -1], ["sparkspitter", 8, 3], ["craneback", 12, 5]] as const) {
      await f.command("cheat", { summon: { species, level: 5, distance, side } });
    }
    await f.wait(15000);
    await f.shot("wildwire-storm-night");
  },
});

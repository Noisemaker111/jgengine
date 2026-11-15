import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * Do the machines read at a distance? A spread of the roster 16 to 24 m out on the beach, and a Hoover
 * Leviathan beside them, from where the technician stands. A shot for review.
 */
const SLOW = { timeoutMs: 120000 };

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.phase === 1 && p.health > 0, SLOW);
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    await f.command("cheat", { destroyWild: true });
    const roster: [string, number, number][] = [
      ["mowbot", 16, -6], ["craneback", 20, -3], ["lodestone", 18, 0], ["klepto", 16, 3], ["sirenhorn", 24, 6], ["homer", 22, -9], ["hoover", 34, 12],
    ];
    for (const [species, distance, side] of roster) await f.command("cheat", { summon: { species, level: 5, distance, side, tamed: true } });
    // Generated robot models build on first sight: give software rendering time to load them.
    await f.wait(45000);
    await f.shot("wildwire-roster-20m");
  },
});

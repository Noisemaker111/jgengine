import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * Wildwire's swimmers: Lampjaws holding deep water off the first beach, and Arcwires in the central river.
 * Shots for review, each from the shore looking out over the water.
 */
const SLOW = { timeoutMs: 120000 };

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.phase === 1 && p.health > 0, SLOW);
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    // Dusk, so the Lampjaws' lures glow. The deep water off the first beach lies south, out past the surf.
    await f.command("cheat", { clock: 3600 * 0.76, teleport: [269, 1585, 0] });
    for (const side of [-4, 0, 4]) await f.command("cheat", { summon: { species: "lampjaw", level: 5, distance: 9, side } });
    // Generated robot models build on first sight: give software rendering time to load them.
    await f.wait(45000);
    await f.shot("wildwire-lampjaws");
    // The central river, an Arcwire pair swimming it.
    await f.command("cheat", { clock: 3600 * 0.5, teleport: [96, 640, Math.PI] });
    for (const side of [-2, 2]) await f.command("cheat", { summon: { species: "arcwire", level: 5, distance: 8, side } });
    // Generated robot models build on first sight: give software rendering time to load them.
    await f.wait(45000);
    await f.shot("wildwire-river-arcwires");
  },
});

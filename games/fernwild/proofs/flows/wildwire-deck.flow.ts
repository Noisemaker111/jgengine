import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * Review shot: a thatch foundation and two walls on an uploaded Hoover's back as it walks after the technician.
 */
const SLOW = { timeoutMs: 120000 };

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.phase === 1 && p.health > 0, SLOW);
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    // Noon on the first beach where the survivor washes up; an uploaded Hoover 16 m ahead along the sand.
    await f.command("cheat", { clock: 1800 });
    await f.command("cheat", { summon: { species: "hoover", level: 5, distance: 16, tamed: true } });
    // Generated robot models build on first sight: give software rendering time to load them.
    await f.wait(40000);
    await f.command("cheat", { deckHut: "thatch" });
    await f.wait(1500);
    await f.shot("wildwire-deck-hut");
    // Whistled to follow, then the technician steps back along the sand: it walks after them, hut and all.
    await f.command("whistleFollow", {});
    await f.command("cheat", { teleport: [244, 1338, -Math.PI / 2] });
    await f.waitFor((p) => Math.abs(p.x - 244) < 2, { timeoutMs: 5000 });
    await f.wait(5000);
    await f.shot("wildwire-deck-walking");
  },
});

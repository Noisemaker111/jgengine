import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** An uploaded Hoover Leviathan on the beach, the technician aboard its back. A shot for review. */
const SLOW = { timeoutMs: 120000 };

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.phase === 1 && p.health > 0, SLOW);
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    await f.command("cheat", { summon: { species: "hoover", level: 5, distance: 6, tamed: true } });
    await f.wait(2000);
    await f.press("KeyE");
    await f.see(/Climb aboard/, SLOW);
    // The button can sit below the fold of a long card; the same command it sends climbs aboard.
    await f.command("boardCarrier", {});
    await f.wait(12000);
    await f.shot("wildwire-hoover-aboard");
  },
});

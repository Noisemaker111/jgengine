import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * Wildwire's machines on screen: roster bots roaming the south beach, a drained Mowbot open for the
 * upload, and the same beach on a Signal Storm night. Shots for review, each after the scene settles.
 */
const SLOW = { timeoutMs: 120000 };

export default defineFlow(game, {
  browser: true,
  async run(f) {
    const frames = async () => Number(await f.page("window.__jgNativeUi?.stats().frames ?? 0"));
    let shotAt = 0;
    const snap = async (name: string) => {
      for (let polls = 0; polls < 20 && (await frames()) <= shotAt; polls += 1) await f.wait(3000);
      await f.wait(8000);
      for (let last = -1, now = await frames(); now !== last; last = now, now = await frames()) await f.wait(4000);
      await f.shot(name);
      shotAt = await frames();
    };
    await f.waitFor((p) => p.phase === 1 && p.health > 0, SLOW);
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    // A spread of the roster in front of the technician, near to far, left to right.
    const roster: [string, number, number][] = [
      ["mowbot", 5, -2], ["craneback", 9, 3], ["lodestone", 8, -5], ["ticklet", 4, 1.5], ["bulldozaur", 14, -7],
      ["homer", 12, 6], ["klepto", 6, 3.5], ["watchwing", 16, 0], ["sirenhorn", 18, 9], ["choir", 7, -1],
    ];
    for (const [species, distance, side] of roster) await f.command("cheat", { summon: { species, level: 5, distance, side, tamed: true } });
    await f.wait(2000);
    await snap("wildwire-island-bots");
    // A drained Mowbot, jacked into.
    await f.command("cheat", { summon: { species: "mowbot", level: 3, distance: 2.5, knockedOut: true } });
    await f.wait(1500);
    await f.press("KeyE");
    await f.see(/Upload|Discharge/, SLOW);
    await snap("wildwire-upload");
    await f.press("Escape");
    await f.wait(1500);
    // Night, and the broadcast.
    await f.command("cheat", { clock: 3600 * 0.9, storm: true });
    await f.wait(3000);
    await snap("wildwire-storm-night");
  },
});

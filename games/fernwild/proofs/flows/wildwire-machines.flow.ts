import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * Wildwire's machines on screen: a spread of the roster on the south beach, uploaded and idling round the
 * technician. A shot for review once the scene settles (wildwire-upload and wildwire-storm take the others).
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
  },
});

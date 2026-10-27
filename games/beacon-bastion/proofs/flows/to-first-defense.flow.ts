import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see(/begin first assault/i, { timeoutMs: 40000, note: "arrival: a fresh defense is up and the director is offering wave 1, not the title card" });
    await f.expect((p) => p.wave === 1 && p.creeps === 0, "the defense opens on wave 1 with the approach empty, read from the game's own session");
    // release wave 1 with the keep's own release button
    await f.click("Begin first assault");
    await f.see(/\d+ raiders? left/i, { timeoutMs: 20000 });
    await f.expectPage("__jgProbe().creeps > 0 && /wave 1/i.test(document.body.innerText)", "arrival: the director put wave 1's raiders on the authored path, so the wave mustered rather than only the click landing");
    await f.see(/send wave 2/i, { timeoutMs: 60000 });
    await f.expectPage("/send wave 2/i.test(document.body.innerText) && /\\+\\d+ gold/i.test(document.body.innerText)", "arrival: wave 1 has fully mustered, the horn offers wave 2 early for gold while the clock runs down");
    // the loop turns: the next wave releases off the same director
    await f.click("Send wave 2");
    await f.see(/wave 2[^]*\d+ raiders? left/i, { timeoutMs: 20000 });
    await f.expect((p) => p.wave === 2 && p.creeps > 0, "arrival: wave 2 is on the field from the game's own session, so a defense is a repeating loop and not one authored wave");
  },
});

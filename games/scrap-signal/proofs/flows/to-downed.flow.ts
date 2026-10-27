import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "downed",
  browser: true,
  async run(f) {
    // arrival: the chassis is in the Emergency Reserve window, read from the shared downed state
    await f.waitFor((p) => p.reserveDowned === 1);
    const { scrapCash: cash } = await f.expect((p) => p.reserveBleedout > 11 && p.scrapCash > 0, "the window opened at the game's 12 s and the wallet the reconstruct fee comes out of is known");
    await f.waitForPage("/reboot window/i.test(document.body.innerText) && /power surge/i.test(document.body.innerText)", { timeoutMs: 5000, note: "the live banner and the kill-for-a-surge prompt are on screen, as before the adoption" });
    // the window ran out and the game reconstructed the chassis at the shared state's own `died` event
    await f.waitFor((p) => p.reserveDowned === 0 && p.reserveDead === 0, { timeoutMs: 20000 });
    await f.expect((p) => p.scrapCash === cash - Math.floor(cash * 0.07), "respawn: the game's own 7% fee left the wallet, floor-rounded as before, and nothing else changed");
  },
});

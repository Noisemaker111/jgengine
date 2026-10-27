import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "chase",
  browser: true,
  async run(f) {
    await f.expectPage("/HHPD IS HUNTING YOU|SEARCH \\d+ M/.test(document.body.innerText) && document.body.innerText.includes('★')", "arrival: a live pursuit with the wanted strip up, staged by the game's own chase.stage");
    // drive out of the search area
    await f.hold("KeyW", { ms: 3000 });
    await f.waitForPage("(() => { const m = /SEARCH (\\d+) M/.exec(document.body.innerText); if (m === null) return false; const radius = Number(m[1]); if (window.__heatBaseline === undefined) { window.__heatBaseline = radius; return false; } return radius >= window.__heatBaseline + 10; })()", { timeoutMs: 25000, note: "arrival: the search area grew 10 m under the drive, so the heat was simulated and the trail went cold instead of the keypress being the only thing that happened" });
  },
});

import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "mission-cleared",
  browser: true,
  async run(f) {
    await f.waitForPage("window.__jgengineRun !== undefined && window.__jgengineRun.read().closed >= 1", { timeoutMs: 30000, note: "arrival: the campaign mission's boundary settled on the shared session loop" });
    await f.expectPage("(() => { const readout = window.__jgengineRun.read(); return readout.kind === 'mission' && readout.phase === 'closed' && readout.closed === 1 && readout.carried === 0; })()", "arrival: the loop names the closed mission session and has handed back the pay it carried");
    await f.expectPage("document.body.innerText.includes('The Long Watch')", "arrival: the field desk offers the next order, so the mission cleared in the game and not only in the loop");
  },
});

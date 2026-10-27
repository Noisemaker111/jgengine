import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "dead-air",
  browser: true,
  async run(f) {
    await f.waitForPage("window.__jgengineRun !== undefined && window.__jgengineRun.read().closed >= 1", { timeoutMs: 45000, note: "arrival: the ambush's boundary settled — the shared loop closed the wave with the signal it carried" });
    await f.expectPage("(() => { const readout = window.__jgengineRun.read(); return readout.kind === 'wave' && readout.closed === 1 && readout.session === 2; })()", "arrival: one wave closed and the next opened on the same contract, so the signal banked at a real boundary");
    await f.expectPage("document.body.innerText.includes('DEAD AIR')", "arrival: the operations panel shows the contract the loop is running");
  },
});

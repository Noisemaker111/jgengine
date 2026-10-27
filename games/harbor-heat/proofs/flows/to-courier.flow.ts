import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.expectPage("/take standard parcel/i.test(document.body.innerText)", "arrival: the dispatch booth is in reach at the authored spawn, so a parcel can be taken");
    // take the contract the courier session runs
    await f.click("Take standard parcel");
    await f.waitForPage("window.__jgengineRun !== undefined && window.__jgengineRun.read().phase === 'open'", { timeoutMs: 15000, note: "arrival: the shared session loop opened a mission in the real game" });
    await f.expectPage("window.__jgengineRun.read().kind === 'mission' && window.__jgengineRun.read().carried === 0", "arrival: the probe names the live mission, carrying nothing until its boundary");
    await f.waitForPage("window.__jgengineRun.read().phase === 'closed'", { timeoutMs: 90000, note: "the deadline is the contract's own boundary: the session closes when it expires" });
    await f.expectPage("(() => { const readout = window.__jgengineRun.read(); return readout.closed >= 1 && /missed the tide/i.test(document.body.innerText); })()", "arrival: the closed session settled at the boundary and the receipt is up");
  },
});

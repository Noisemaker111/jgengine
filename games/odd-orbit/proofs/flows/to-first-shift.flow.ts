import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.members === 4, { timeoutMs: 40000 });
    await f.expect((p) => p.members === 4 && p.day === 0, "arrival: a fresh household of four is live on its first day, not the title card");
    await f.waitFor((p) => p.working >= 1, { timeoutMs: 40000 });
    await f.expectPage("__jgProbe().working >= 1 && /yield shift \\d+\\/20s/i.test(document.body.innerText)", "arrival: a member is standing at a paid station and the HUD's own shift readout is counting, so the shift started and is not a queued order");
    const credits = (await f.probe()).credits;
    await f.waitFor((p) => p.credits > credits, { timeoutMs: 150000, note: "arrival: that shift finished and paid a wage into the household ledger, which is the loop's own payout and not a clock advancing" });
    await f.waitForPage("window.__jgengineRun !== undefined && window.__jgengineRun.read().closed >= 1", { timeoutMs: 90000, note: "arrival: the shift's own boundary settled on the shared loop — the session the member was working closed" });
    await f.expectPage("(() => { const readout = window.__jgengineRun.read(); return readout.kind === 'shift' && readout.closed >= 1 && readout.phase === 'closed'; })()", "arrival: the loop names the closed shift session, and the day's paid work is spent until tomorrow");
  },
});

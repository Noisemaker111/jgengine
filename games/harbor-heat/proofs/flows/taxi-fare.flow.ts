import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "taxi",
  browser: true,
  async run(f) {
    // arrival: in a car, taxi light on, a fare hailing at the nearest kerb
    await f.waitForPage("window.__harborGigs !== undefined && window.__harborGigs.read().duty === true && window.__harborGigs.read().offers.some((o) => o.kindId === 'taxi')", { timeoutMs: 15000 });
    // the pager names the hail and its fare
    await f.see(/fare hailing/i, { timeoutMs: 5000 });
    await f.expectPage("(window.__hg = (n, i) => window.__jgengineAgent.handle({ method: 'run_command', name: n, input: i || {} }), __hg('gigs.warp', { short: 0 }), true)", "pull up beside the waving fare");
    // stopped beside them: the fare climbs in and the clock starts
    await f.waitForPage("window.__harborGigs.read().view !== null && window.__harborGigs.read().view.phase === 'en-route'", { timeoutMs: 10000 });
    // the pager shows the drop, the fare so far and the tip
    await f.waitForPage("/drop at/i.test(document.body.innerText) && /tip 100%/i.test(document.body.innerText)", { timeoutMs: 5000 });
    await f.shot("gigs-taxi-aboard");
    await f.expectPage("(window.__cashBefore = window.__harborGigs.read().view.fareSoFar, __hg('gigs.warp', { short: 0 }), true)", "arrive at the drop kerb");
    // stopped at the drop: paid
    await f.waitForPage("window.__harborGigs.read().receipt !== null && window.__harborGigs.read().receipt.outcome === 'paid'", { timeoutMs: 10000 });
    await f.expectPage("(() => { const r = window.__harborGigs.read().receipt; return r.total >= r.fare && r.tip > 0 && r.streak === 1; })()", "fare, time bonus and a full tip landed, and the streak counts one");
    // the receipt notice is on screen
    await f.see(/ paid [$]/i, { timeoutMs: 4000 });
    await f.shot("gigs-taxi-paid");
  },
});

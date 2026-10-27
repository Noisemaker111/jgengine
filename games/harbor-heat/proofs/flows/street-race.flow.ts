import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "taxi",
  browser: true,
  async run(f) {
    // arrival: in a car with $250
    await f.waitForPage("window.__harborGigs !== undefined && window.__jgengineAgent !== undefined && window.__harborGigs.read().duty === true", { timeoutMs: 15000 });
    await f.expectPage("(window.__hg = (n, i) => window.__jgengineAgent.handle({ method: 'run_command', name: n, input: i || {} }), __hg('taxiDuty'), __hg('gigs.race'), true)", "taxi light off, then the phone's Find a street race: the $200 stake is paid");
    // the pager points at the start line
    await f.waitForPage("(() => { const v = window.__harborGigs.read().view; return v !== null && v.kindId === 'street' && v.phase === 'pickup' && /get to the start line/i.test(document.body.innerText); })()", { timeoutMs: 5000 });
    await f.expectPage("(__hg('gigs.warp', { short: 0 }), true)", "pull onto the start line");
    // stopped on the line: two rival cars line up and the race goes
    await f.waitForPage("(() => { const v = window.__harborGigs.read().view; return v !== null && v.phase === \"en-route\" && v.rivals.length === 2; })()", { timeoutMs: 8000 });
    // launch off the line beside the rivals
    await f.hold("KeyW", { ms: 2500 });
    await f.shot("gigs-race-start");
    // run every gate in order until the finish
    await f.waitForPage("(() => { const g = window.__harborGigs.read(); if (g.receipt !== null) return true; const t = performance.now(); if (window.__lw === undefined || t - window.__lw > 700) { window.__lw = t; __hg('gigs.warp', { short: 0 }); } return false; })()", { timeoutMs: 40000 });
    await f.expectPage("(() => { const r = window.__harborGigs.read().receipt; return r.kindId === 'street' && r.place === 1 && r.purse === 600; })()", "first place pays three times the stake");
    // the purse notice is on screen
    await f.see(/won .* — [$]600 purse/i, { timeoutMs: 4000 });
    await f.shot("gigs-race-won");
  },
});

import { defineProof, type ProofPlay } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import type { Probe } from "./scenarios";

type Play = ProofPlay<Probe>;
const WALK = 4;

/** Walk where the game's guidance points (the goal card's station, or the room's next find, door or way out) until `near`. */
async function follow(p: Play, near: number, maxMs = 60_000): Promise<void> {
  let best = Number.POSITIVE_INFINITY, stalled = 0, detours = 0;
  for (let spent = 0; spent < maxMs;) {
    const r = await p.probe();
    if (r.guideDist >= 0 && r.guideDist <= near) return;
    const yaw = Math.atan2(r.guideX - r.x, r.guideZ - r.z);
    if (r.guideDist < best - 0.2) { best = r.guideDist; stalled = 0; }
    else if ((stalled += 1) >= 3) {
      detours += 1; stalled = 0; best = Number.POSITIVE_INFINITY;
      await p.heading(yaw + (detours % 2 === 1 ? Math.PI / 2 : -Math.PI / 2));
      await p.hold("KeyW", { ms: 700 * Math.min(detours, 4) });
      spent += 700 * Math.min(detours, 4);
      continue;
    }
    await p.heading(yaw);
    const ms = Math.max(100, Math.min(900, ((r.guideDist - near) / WALK) * 1000));
    await p.hold("KeyW", { ms });
    spent += ms;
  }
  throw new Error("the guidance never came within reach");
}

// A new burrow follows only the game's own guidance: the goal card's station, then the prompts in the
// house. Every core verb gets its first use: slipping out, rummaging, a door on and back, getting home,
// building at the workbench, and choosing who goes next at the nook.
export default defineProof(game, {
  proves: ["onboarding.find-features"],
  async play(p) {
    // The title's Enter: the burrow's record is read between frames.
    await p.act("deepward.enter");
    await p.waitFor((r) => r.home === 1, { timeoutMs: 10_000, note: "in the burrow" });
    await p.expect((r) => r.goal === 0 && r.extractions === 0 && r.larder === 0, "a new burrow, nothing done");
    // "Slip out through the crack."
    await follow(p, 1.8);
    // The prompt's button (E): the departure is written before the house opens.
    await p.act("deepward.interact");
    await p.waitFor((r) => r.inRun === 1, { timeoutMs: 3000, note: "slipped out" });
    // The first room's finds, one after another, as the prompts lead.
    for (let n = 0; n < 3; n += 1) {
      await follow(p, 1.6);
      await p.press("KeyE");
      await p.waitFor((r) => r.carried > n, { timeoutMs: 4000, note: `find ${n + 1} in the pack` });
    }
    // A door on, and back.
    await follow(p, 2.2);
    await p.press("KeyE");
    await p.waitFor((r) => r.depth === 1, { timeoutMs: 6000, note: "a room deeper" });
    await p.act("deepward.interact");
    await p.waitFor((r) => r.depth === 0, { timeoutMs: 8000, note: "back by the way you came" });
    // Home through the crack.
    await follow(p, 2.2);
    await p.press("KeyE");
    await p.waitFor((r) => r.returning === 1, { timeoutMs: 4000, note: "squeezing home" });
    await p.act("deepward.retrySave");
    await p.waitFor((r) => r.home === 1, { timeoutMs: 3000, note: "home safe" });
    await p.act("deepward.close");
    // The goal card now names the larder at the workbench.
    await p.expect((r) => r.goal === 1, "the card points at the larder");
    await follow(p, 2.4);
    await p.press("KeyE");
    await p.expect((r) => r.panel === 2, "the workbench is open");
    await p.act("deepward.upgrade", { id: "larder" });
    await p.wait(200);
    await p.act("deepward.close");
    await p.waitFor((r) => r.larder === 1, { timeoutMs: 2000, note: "the larder is built" });
    // Then the nook, where you choose who goes next.
    await follow(p, 2.4);
    await p.press("KeyE");
    await p.expect((r) => r.panel === 3, "the nook is open");
    await p.act("deepward.chooseLittle", { id: "bolt" });
    await p.wait(200);
    await p.act("deepward.close");
    await p.waitFor((r) => r.little === 1, { timeoutMs: 2000, note: "Bolt goes next" });
  },
});

import { defineProof, type ProofPlay } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { WAYPOINT_KINDS } from "../../src/game/progression/probe";
import { pull, type Probe } from "./scenarios";

type Play = ProofPlay<Probe>;
const kind = (name: (typeof WAYPOINT_KINDS)[number]): number => WAYPOINT_KINDS.indexOf(name);

/** Walk where the quest marker points until it is within `near`. */
async function follow(p: Play, near: number, maxSteps = 400): Promise<Probe> {
  let detours = 0, best = Number.POSITIVE_INFINITY, stalled = 0;
  for (let step = 0; step < maxSteps; step += 1) {
    const r = await p.probe();
    if (r.goalDistance >= 0 && r.goalDistance <= near) return r;
    const yaw = Math.atan2(r.goalX - r.playerX, r.goalZ - r.playerZ);
    if (r.goalDistance < best - 0.2) { best = r.goalDistance; stalled = 0; }
    else if ((stalled += 1) >= 4) {
      detours += 1; stalled = 0; best = Number.POSITIVE_INFINITY;
      await p.heading(yaw + (detours % 2 === 1 ? Math.PI / 2 : -Math.PI / 2));
      await p.hold("KeyW", { ms: 500 });
      continue;
    }
    await p.heading(yaw);
    await p.hold("KeyW", { ms: r.goalDistance > 6 ? 400 : 120 });
  }
  throw new Error("the marker never came within reach");
}

/** Press E on whoever the marker points at, read what they say, and take the errand. */
async function takeErrand(p: Play): Promise<void> {
  await follow(p, 2.4);
  await p.hold("KeyE", { until: (r) => r.dialogOpen === 1, timeoutMs: 3000 });
  await p.wait(2500);
  await p.press("KeyE");
}

// A new game follows only the marker and the fridge-magnet notes: DING's first errand, the toy chest,
// the staple gun (which introduces itself), back to DING, then the push mowers — the first shot, the
// first reload and the first kill — and the first skill point spent in the tree K opens.
export default defineProof(game, {
  proves: ["onboarding.find-features"],
  async play(p) {
    const start = await p.expect((r) => r.gunsHeld === 0 && r.kills === 0 && r.questsSeen === 0, "a new game, empty-handed");
    await takeErrand(p);
    await p.waitFor((r) => r.questsSeen === 1 && r.goalKind === kind("chest"), { timeoutMs: 3000, note: "the marker moves to the toy chest" });
    await follow(p, 2.2);
    await p.press("KeyE");
    await p.waitFor((r) => r.goalKind === kind("loot"), { timeoutMs: 3000, note: "the chest opened; the marker is on the staple gun" });
    await follow(p, 1.2);
    await p.hold("KeyE", { until: (r) => r.gunsHeld === 1, timeoutMs: 3000 });
    await p.waitFor((r) => r.goalKind === kind("npc"), { timeoutMs: 3000, note: "back to DING" });
    await takeErrand(p);
    await p.waitFor((r) => r.questsSeen === 2 && r.goalKind === kind("enemy"), { timeoutMs: 3000, note: "the marker is on a push mower" });
    // Shoot what the marker marks until the first kill, reloading when the magazine runs dry.
    let reloaded = false;
    for (let step = 0; step < 300 && (await p.probe()).kills === start.kills; step += 1) {
      const r = await p.probe();
      if (r.goalDistance > 8) {
        await p.heading(Math.atan2(r.goalX - r.playerX, r.goalZ - r.playerZ));
        await p.hold("KeyW", { ms: 250 });
        continue;
      }
      if (r.magFill === 0) {
        await p.press("KeyR");
        await p.wait(1600);
        reloaded = true;
        continue;
      }
      const yaw = Math.atan2(r.goalX - r.playerX, r.goalZ - r.playerZ);
      const pitch = Math.atan2(r.goalY + 0.3 - (r.playerY + 1.62), Math.max(0.5, r.goalDistance));
      await p.heading(yaw);
      await pull(p, yaw, pitch);
    }
    await p.expect((r) => r.kills > start.kills, "the first push mower mowed down");
    // Keep at the errand until a level brings the first skill point, then spend it.
    for (let step = 0; step < 400 && (await p.probe()).skillPoints < 1; step += 1) {
      const r = await p.probe();
      if (r.goalKind !== kind("enemy")) break;
      if (r.goalDistance > 8) {
        await p.heading(Math.atan2(r.goalX - r.playerX, r.goalZ - r.playerZ));
        await p.hold("KeyW", { ms: 250 });
        continue;
      }
      if (r.magFill === 0) { await p.press("KeyR"); await p.wait(1600); reloaded = true; continue; }
      const yaw = Math.atan2(r.goalX - r.playerX, r.goalZ - r.playerZ);
      await p.heading(yaw);
      await pull(p, yaw, Math.atan2(r.goalY + 0.3 - (r.playerY + 1.62), Math.max(0.5, r.goalDistance)));
    }
    await p.expect((r) => r.skillPoints >= 1, "a level up brought a skill point");
    await p.press("KeyK");
    await p.act("talent.spend", { nodeId: "gunk_hot_chamber" });
    await p.expect((r) => r.skillsLearned === 1 && reloaded, "talked, opened, picked up, shot, reloaded, killed and spent a point");
  },
});

import { defineProof, type ProofPlay } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

type Probe = ReturnType<NonNullable<NonNullable<typeof game.capture>["probe"]>>;
type Play = ProofPlay<Probe>;

/** Metres a walking survivor covers in a second. */
const WALK = 4.9;

/**
 * Walk where the Survivor's path points (its arrow and minimap star) until it is `near` metres off: hop a step
 * that stalls the walk, and go round what blocks it.
 */
async function followPointer(p: Play, near: number, maxMs = 120_000): Promise<void> {
  let best = Number.POSITIVE_INFINITY;
  let stalled = 0;
  let detours = 0;
  for (let spent = 0; spent < maxMs; ) {
    const r = await p.probe();
    if (r.pointDist >= 0 && r.pointDist <= near) return;
    if (r.pointDist >= 0 && r.pointDist < best - 0.3) {
      best = r.pointDist;
      stalled = 0;
    } else if ((stalled += 1) === 2 || stalled === 3) {
      await p.heading(r.pointYaw);
      await p.hold(["Space", "KeyW"], { ms: 380 });
      spent += 380;
      continue;
    } else if (stalled >= 4) {
      detours += 1;
      await p.heading(r.pointYaw + (detours % 2 === 1 ? Math.PI / 2 : -Math.PI / 2));
      await p.hold("KeyW", { ms: 1500 * Math.min(detours, 4) });
      spent += 1500 * Math.min(detours, 4);
      stalled = 0;
      best = Number.POSITIVE_INFINITY;
      continue;
    }
    await p.heading(r.pointYaw);
    const ms = r.pointDist < 0 ? 1000 : Math.max(120, Math.min(1000, ((r.pointDist - near) / WALK) * 1000));
    await p.hold("KeyW", { ms });
    spent += ms;
  }
  throw new Error(`the path's pointer never came within ${near} m`);
}

/** Run down the creature the path points at, hitting it, until it lies unconscious. */
async function knockOutPointed(p: Play, maxMs = 150_000): Promise<void> {
  for (let spent = 0; spent < maxMs; ) {
    const r = await p.probe();
    if (r.aimedDown === 1) return;
    await p.heading(r.pointYaw);
    if (r.pointDist > 1.4) {
      const run = r.pointDist > 4 && r.stamina > 20;
      const ms = Math.max(120, Math.min(800, ((r.pointDist - 1.2) / (run ? WALK * 1.8 : WALK)) * 1000));
      await p.hold(run ? ["ShiftLeft", "KeyW"] : "KeyW", { ms });
      spent += ms;
    } else {
      await p.hold("mouse0", { ms: 300 });
      spent += 300;
    }
  }
  throw new Error("the pointed creature never went down");
}

// A new survivor follows only the Survivor's path through its teaching area on the beach, and each core feature
// there gets its first use: gathering by hand and by tool, crafting, learning an engram, foraging, drinking and
// taming. Every walk goes where the path's pointer leads; every action is the one its step names.
export default defineProof(game, {
  proves: ["onboarding.find-features"],
  setup(s) {
    s.waitFor((r) => r.creatures > 0 && r.health > 0, { timeoutMs: 60_000 });
  },
  async play(p) {
    await p.expect((r) => r.taught === 0 && r.thatch === 0 && r.picks === 0 && r.tamed === 0, "a new survivor with nothing taught and nothing in hand");
    // "Punch a tree for thatch"
    await followPointer(p, 1.6);
    await p.hold("mouse0", { until: (r) => r.thatch >= 22 && r.wood >= 2, timeoutMs: 60_000 });
    await p.expect((r) => r.taught >= 1, "gathered by hand: the first step done");
    // "Gather stone"
    await followPointer(p, 1.5);
    await p.press("KeyE");
    await p.waitFor((r) => r.stone >= 1, { timeoutMs: 2000, note: "a stone picked up" });
    // "Craft a Stone Pick"
    await p.press("KeyI");
    await p.act("craft", { recipeId: "stone_pick" });
    await p.press("KeyI");
    await p.waitFor((r) => r.picks >= 1, { timeoutMs: 20_000, note: "crafted: a stone pick" });
    // "Learn and craft a Stone Hatchet": the engram, then flint from the rock the path points at
    await p.act("learn", { engramId: "stone_hatchet" });
    await p.expect((r) => r.unlocks >= 3, "learned an engram");
    await p.press(`Digit${(await p.probe()).pickKey}` as "Digit1");
    await p.waitFor((r) => r.holding === r.pickKey, { timeoutMs: 2000, note: "the pick in hand" });
    await followPointer(p, 1.8);
    await p.hold("mouse0", { until: (r) => r.flint >= 3, timeoutMs: 30_000 });
    await p.act("craft", { recipeId: "stone_hatchet" });
    await p.waitFor((r) => r.hatchets >= 1, { timeoutMs: 20_000, note: "gathered with a tool, crafted a hatchet" });
    await p.press(`Digit${(await p.probe()).holding}` as "Digit1");
    await p.waitFor((r) => r.holding === 0, { timeoutMs: 2000, note: "empty hands" });
    // "Pick berries"
    for (let bush = 0; bush < 12 && (await p.probe()).berries < 12; bush += 1) {
      await followPointer(p, 1.4);
      for (let pick = 0; pick < 4; pick += 1) await p.press("KeyE");
    }
    await p.expect((r) => r.berries >= 12, "foraged a dozen berries");
    // "Drink at the shore"
    await followPointer(p, 0.5);
    await p.press("KeyE");
    await p.waitFor((r) => r.drinks >= 1, { timeoutMs: 3000, note: "drank at the shore" });
    // "Tame a dodo": punch it asleep, then its inventory and the berries
    await knockOutPointed(p);
    await p.hold("KeyE", { until: (r) => r.screen === 1, timeoutMs: 3000 });
    await p.waitFor((r) => r.foodSlot >= 0, { timeoutMs: 2000, note: "berries to give it" });
    for (let stack = 0; stack < 8 && (await p.probe()).foodSlot >= 0; stack += 1) await p.act("giveCreature", { inventoryId: "inventory", slot: (await p.probe()).foodSlot });
    await p.waitFor((r) => r.tamed === 1, { timeoutMs: 300_000, note: "the dodo eats the berries and is tamed" });
    await p.act("closeCreature", {});
    await p.waitFor((r) => r.taught >= 7, { timeoutMs: 3000, note: "every step of the teaching area done" });
  },
});

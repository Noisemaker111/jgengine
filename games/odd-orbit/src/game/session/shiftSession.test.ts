import { expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../../game.config";
import { registerCommands } from "../commands";
import { content } from "../content";
import { householdStore } from "./store";
import { probeShift, shiftLoop, shiftRan } from "./shiftSessions";
import { setupWorld } from "../sim/setup";
import { simulateHousehold } from "../sim/simulate";

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "orbit-shift-test", isNew: true } });
  setupWorld(ctx);
  registerCommands(ctx);
  return ctx;
}

function advance(ctx: GameContext, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.25) simulateHousehold(ctx, 0.25);
}

function startYieldShift(ctx: GameContext, id: string): void {
  const state = householdStore.read(ctx);
  const member = state.members[id]!;
  member.needs = { hunger: 95, energy: 95, social: 95, fun: 95 };
  member.lifestyle = "yield";
  member.workToday = 0;
  member.action = { kind: "use", goal: "work", objId: "starter:work_console" };
  member.assignedByPlayer = true;
  member.actionUntil = ctx.time.now() + 40;
  householdStore.write(ctx, { ...state, members: { ...state.members } });
}

/** A shift is a session on the shared loop: it opens for the day, carries the pay it earns, settles. */
test("the shift session opens for the day, carries its pay and settles at the window's end", () => {
  const ctx = boot();
  const id = householdStore.read(ctx).order[0]!;
  const loop = shiftLoop(ctx, id);
  expect(loop.kind()).toBe("shift");
  expect(loop.phase()).toBe("idle");

  startYieldShift(ctx, id);
  advance(ctx, 8);
  expect(loop.phase()).toBe("open");
  expect(loop.snapshot().session).toBe(householdStore.read(ctx).day + 1);
  expect(loop.carried()).toBeGreaterThan(0);
  expect(shiftRan(ctx, id, householdStore.read(ctx).day)).toBe(false);

  advance(ctx, 14);
  const member = householdStore.read(ctx).members[id]!;
  expect(member.completedShifts).toBe(1);
  expect(loop.phase()).toBe("closed");
  expect(loop.snapshot().closed).toBe(householdStore.read(ctx).day + 1);
  // A closed day is spent: the paid shift cannot be taken twice.
  expect(shiftRan(ctx, id, householdStore.read(ctx).day)).toBe(true);
});

test("a reloaded household does not take the same day's shift twice", () => {
  const ctx = boot();
  const id = householdStore.read(ctx).order[0]!;
  startYieldShift(ctx, id);
  advance(ctx, 22);
  const saved = householdStore.read(ctx);
  expect(saved.members[id]!.completedShifts).toBe(1);

  // A reload builds the shift loop fresh; the member's saved day is what keeps the shift spent.
  const reloaded = boot();
  householdStore.write(reloaded, structuredClone({ ...saved, members: { ...saved.members } }));
  expect(shiftRan(reloaded, id, saved.day)).toBe(true);
});

test("the probe reports the member's live shift session", () => {
  const ctx = boot();
  const id = householdStore.read(ctx).order[0]!;
  probeShift(ctx, id);
  const probe = (globalThis as { __jgengineRun?: { read(): { kind: string | null; phase: string; session: number } } }).__jgengineRun;
  expect(probe?.read()).toMatchObject({ kind: "shift", phase: "idle" });
  startYieldShift(ctx, id);
  advance(ctx, 4);
  expect(probe?.read()).toMatchObject({ kind: "shift", phase: "open" });
});

test("a closed shift stays on the probe while the next member's shift ticks, until that one closes", () => {
  const ctx = boot();
  const [first, second] = householdStore.read(ctx).order as [string, string];
  const readout = () => (globalThis as { __jgengineRun?: { read(): { phase: string; closed: number } } }).__jgengineRun?.read();
  startYieldShift(ctx, first);
  advance(ctx, 22);
  expect(householdStore.read(ctx).members[first]!.completedShifts).toBe(1);
  expect(readout()).toMatchObject({ phase: "closed", closed: 1 });

  // The console frees up and the next member starts the same day: the boundary that just settled stays readable.
  startYieldShift(ctx, second);
  advance(ctx, 4);
  expect(shiftLoop(ctx, second).phase()).toBe("open");
  expect(readout()).toMatchObject({ phase: "closed", closed: 1 });

  advance(ctx, 20);
  expect(householdStore.read(ctx).members[second]!.completedShifts).toBe(1);
  expect(readout()).toMatchObject({ phase: "closed", closed: 1 });
});

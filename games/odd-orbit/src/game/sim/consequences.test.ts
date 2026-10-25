import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { DAY_LENGTH } from "../../world";
import { game } from "../../game.config";
import { registerCommands } from "../commands";
import { householdBook } from "../agents";
import { content } from "../content";
import { householdStore } from "../session/store";
import { pairKey, type Lifestyle } from "../session/types";
import { nextBill } from "./economy";
import { shiftIsOpen, yieldShiftLabel } from "./schedule";
import { setupWorld } from "./setup";
import { simulateHousehold, startConversation, waitingForStation } from "./simulate";

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "orbit-policy-test", isNew: true } });
  setupWorld(ctx);
  registerCommands(ctx);
  ctx.game.commands.define("orbit.checkpoint", { apply() {} });
  setGamePhase(ctx, "playing");
  return ctx;
}

/** Every notice pushed so far, including ones stacked onto a live notice. */
function noticeLog(ctx: GameContext): string[] {
  const log: string[] = [];
  ctx.game.notices.onPush(notice => log.push(notice.text));
  return log;
}

function advance(ctx: GameContext, seconds: number, step = 0.25): void {
  let remaining = seconds;
  while (remaining > 1e-8) {
    const dt = Math.min(remaining, step);
    simulateHousehold(ctx, ctx.time.advance(dt));
    remaining -= dt;
  }
}

function build(ctx: GameContext, toolId: string, x: number, z: number): void {
  ctx.game.commands.run("build.tool", { toolId });
  ctx.game.commands.run("world.pointer", { point: { x, y: 0, z }, entity: null, object: null });
}

function lifestyle(ctx: GameContext, style: Lifestyle): void {
  for (const id of householdStore.read(ctx).order) ctx.game.commands.run("member.lifestyle", { id, lifestyle: style });
}

function runDays(ctx: GameContext, days: number, buyFood: boolean, frameSeconds = 0.5): void {
  const end = DAY_LENGTH * days;
  while (ctx.time.now() < end) {
    const state = householdStore.read(ctx);
    if (buyFood && state.pantry <= 4 && state.credits >= 36) ctx.game.commands.run("household.rations", {});
    const remaining = end - ctx.time.now();
    simulateHousehold(ctx, ctx.time.advance(Math.min(frameSeconds, remaining)));
  }
}

describe("chosen daily rhythms", () => {
  test("career and garden households pay three nightly bills with distinct food and savings decisions", () => {
    const career = boot();
    lifestyle(career, "yield");
    build(career, "work_console", 4, 1);
    const garden = boot();
    lifestyle(garden, "bloom");
    build(garden, "bloom_planter", -4, -2);
    runDays(career, 3, true);
    runDays(garden, 3, false);
    const c = householdStore.read(career);
    const g = householdStore.read(garden);
    expect(c.debt).toBe(0);
    expect(g.debt).toBe(0);
    expect(c.economy.cursors.upkeep!.fired).toBe(3);
    expect(g.economy.cursors.upkeep!.fired).toBe(3);
    expect(c.lastDay!.income).toBeGreaterThan(g.lastDay!.income);
    expect(g.lastDay!.harvest).toBeGreaterThanOrEqual(8);
    expect(c.lastDay!.harvest).toBe(0);
    expect(c.credits).toBeGreaterThan(420);
    expect(g.credits).toBeGreaterThan(540);
    for (const state of [c, g]) {
      expect(state.pantry).toBeGreaterThan(0);
      for (const id of state.order) {
        expect(state.members[id]!.recovering).toBe(false);
        expect(state.members[id]!.needs.hunger).toBeGreaterThan(20);
        expect(state.members[id]!.needs.energy).toBeGreaterThan(20);
        expect(state.members[id]!.completedShifts).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test("a late Yield order closes without endless earnings; three completed days unlock flex scheduling", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const member = state.members[state.order[0]!]!;
    const snapshot = ctx.time.snapshot();
    ctx.time.hydrate({ ...snapshot, now: DAY_LENGTH * 14 / 24 });
    member.action = { kind: "use", goal: "work", objId: "starter:work_console" };
    member.assignedByPlayer = true;
    const before = state.credits;
    advance(ctx, 1);
    expect(householdStore.read(ctx).credits).toBe(before);
    expect(member.missedShifts).toBe(1);
    expect(member.workToday).toBe(0);
    member.completedShifts = 3;
    member.needs = { hunger: 90, energy: 90, social: 90, fun: 90 };
    member.action = { kind: "use", goal: "work", objId: "starter:work_console" };
    member.assignedByPlayer = true;
    advance(ctx, 1);
    expect(householdStore.read(ctx).credits).toBeGreaterThan(before);
  });

  test("one console cannot serve two simultaneous shifts", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const a = state.members[state.order[0]!]!;
    const b = state.members[state.order[2]!]!;
    for (const m of [a, b]) {
      m.needs = { hunger: 90, energy: 90, social: 90, fun: 90 };
      m.action = { kind: "use", goal: "work", objId: "starter:work_console" };
      m.assignedByPlayer = true;
      m.actionUntil = ctx.time.now() + 12;
    }
    const before = state.credits;
    advance(ctx, 1);
    expect(householdStore.read(ctx).credits - before).toBeLessThanOrEqual(5);
    expect(a.workToday + b.workToday).toBe(1);
  });
});

describe("failure and recovery", () => {
  test("empty pantry and overload stop work; relief has debt and rest restores agency", () => {
    const ctx = boot();
    const notices = noticeLog(ctx);
    const state = householdStore.read(ctx);
    const member = state.members[state.order[0]!]!;
    state.credits = 0;
    state.pantry = 0;
    member.needs = { hunger: 10, energy: 10, social: 60, fun: 60 };
    member.stress = 79;
    member.action = { kind: "use", goal: "work", objId: "starter:work_console" };
    member.assignedByPlayer = true;
    advance(ctx, 2);
    expect(member.recovering).toBe(true);
    expect(member.workToday).toBe(0);
    ctx.game.commands.run("household.relief", {});
    expect(householdStore.read(ctx).pantry).toBe(4);
    expect(householdStore.read(ctx).debt).toBe(40);
    ctx.game.commands.run("household.relief", {});
    expect(householdStore.read(ctx).debt).toBe(40);
    advance(ctx, 85);
    expect(member.recovering).toBe(false);
    expect(member.stress).toBeLessThan(35);
    expect(member.needs.energy).toBeGreaterThan(50);
    expect(member.needs.hunger).toBeGreaterThan(35);
    expect(notices.some(text => text.includes("recovered"))).toBe(true);
    expect(nextBill(householdStore.read(ctx), ctx.scene.object.list())).toBeGreaterThan(100);
  });
});

describe("reciprocal trust", () => {
  test("both conversational partners recover needs; interrupting one ends the exchange", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const a = state.members[state.order[0]!]!;
    const b = state.members[state.order[1]!]!;
    for (const m of [a,b]) { m.needs = { hunger: 90, energy: 90, social: 40, fun: 40 }; ctx.scene.entity.setPose(m.id, { position: [0, 0, 0] }); }
    startConversation(state, a, b, ctx.time.now());
    const before = state.relationships[pairKey(a.id, b.id)]!;
    advance(ctx, 2);
    expect(a.needs.social).toBeGreaterThan(50);
    expect(b.needs.social).toBeGreaterThan(50);
    expect(householdStore.read(ctx).relationships[pairKey(a.id,b.id)]!).toBeGreaterThan(before);
    ctx.game.commands.run("member.release", { id: b.id });
    advance(ctx, 0.25);
    expect(a.action.kind).not.toBe("social");
  });

  test("two stressed beings clash instead of farming friendship", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const a = state.members[state.order[0]!]!;
    const b = state.members[state.order[1]!]!;
    for (const m of [a,b]) { m.stress = 72; m.needs = { hunger: 90, energy: 90, social: 40, fun: 40 }; ctx.scene.entity.setPose(m.id, { position: [0, 0, 0] }); }
    startConversation(state, a, b, ctx.time.now());
    const before = state.relationships[pairKey(a.id,b.id)]!;
    advance(ctx, 2);
    expect(householdStore.read(ctx).relationships[pairKey(a.id,b.id)]!).toBeLessThan(before);
    expect(a.concern).toContain("clashed");
    expect(b.concern).toContain("clashed");
  });
});

test("paid time uses fractional progress without frame rounding loss or overtime", () => {
  for (const step of [0.25, 1 / 60]) {
    const ctx = boot();
    const state = householdStore.read(ctx);
    for (const id of state.order) state.members[id]!.lifestyle = "bloom";
    const worker = state.members[state.order[0]!]!;
    worker.lifestyle = "yield";
    worker.needs = { hunger: 95, energy: 95, social: 95, fun: 95 };
    worker.action = { kind: "use", goal: "work", objId: "starter:work_console" };
    worker.assignedByPlayer = true;
    const before = state.credits;
    advance(ctx, 20, step);
    expect(householdStore.read(ctx).credits - before).toBe(100);
    expect(worker.workToday).toBe(20);
    expect(worker.completedShifts).toBe(1);
    ctx.game.commands.run("member.lifestyle", { id: worker.id, lifestyle: "bloom" });
    expect(worker.lifestyle).toBe("yield");
    worker.action = { kind: "use", goal: "work", objId: "starter:work_console" };
    advance(ctx, 1, step);
    expect(householdStore.read(ctx).credits - before).toBe(100);
  }
});

test("earned friendship changes the payoff of tending together for both beings", () => {
  const ctx = boot();
  const state = householdStore.read(ctx);
  const a = state.members[state.order[0]!]!;
  const b = state.members[state.order[1]!]!;
  ctx.time.hydrate({ ...ctx.time.snapshot(), now: DAY_LENGTH * 14 / 24 });
  state.relationships[pairKey(a.id, b.id)] = 70;
  const planter = ctx.scene.object.get("starter:bloom_planter")!;
  for (const m of [a,b]) {
    m.lifestyle = "bloom";
    m.needs = { hunger: 95, energy: 95, social: 95, fun: 70 };
    m.action = { kind: "use", goal: "fun", objId: planter.instanceId };
    m.assignedByPlayer = true;
    ctx.scene.entity.setPose(m.id, { position: [...planter.position] });
  }
  a.bloomCrop = "export";
  advance(ctx, 20);
  expect(a.harvestToday).toBe(2);
  expect(b.harvestToday).toBe(5);
  expect(householdStore.read(ctx).dayHarvest).toBe(7);
  expect(householdStore.read(ctx).dayIncome).toBe(132);
});

test("slow rendered frames preserve three days of shifts, food and nightly settlement", () => {
  const results = [10, 2.5, 0.25, 1 / 60].map(frame => {
    const ctx = boot();
    // Transmissions land on whoever is closest to quarrelling, which a frame's rounding can tip; their
    // own frame stability is covered in incidents.test.ts, so this run holds the storyteller off.
    // Trait multipliers sit near the overload thresholds this run crosses, so it uses two traits that
    // only matter to transmissions.
    const held = householdStore.read(ctx);
    for (const id of held.order) held.members[id]!.traits = ["kind", "handy"];
    householdStore.write(ctx, { ...held, story: { elapsed: 0, points: 0, nextAt: 1e9, lastFiredAt: {}, recent: [], fired: 0 } });
    lifestyle(ctx, "bloom");
    build(ctx, "bloom_planter", -4, -2);
    runDays(ctx, 3, false, frame);
    const state = householdStore.read(ctx);
    return { credits: state.credits, pantry: state.pantry, debt: state.debt, bill: state.lastDay!.bill, income: state.lastDay!.income, harvest: state.lastDay!.harvest, completed: state.order.map(id => state.members[id]!.completedShifts), recovering: state.order.map(id => state.members[id]!.recovering) };
  });
  for (const result of results) {
    expect(result.debt).toBe(0);
    expect(result.bill).toBe(results[1]!.bill);
    expect(Math.abs(result.income - results[1]!.income)).toBeLessThanOrEqual(32);
    expect(Math.abs(result.harvest - results[1]!.harvest)).toBeLessThanOrEqual(2);
    expect([...result.completed].sort()).toEqual([...results[1]!.completed].sort());
    expect(result.recovering).toEqual([false, false, false, false]);
    // A 60 fps run can land one Bloom harvest a tick earlier than a 2.5 s run: at most one harvest's
    // rations and credits apart.
    expect(Math.abs(result.credits - results[1]!.credits)).toBeLessThanOrEqual(56);
    expect(Math.abs(result.pantry - results[1]!.pantry)).toBeLessThanOrEqual(4);
  }
}, 30000);

test("an unattended gap skips paid activity while preserving bills and need consequences", () => {
  const ctx = boot();
  const notices = noticeLog(ctx);
  const before = householdStore.read(ctx).credits;
  simulateHousehold(ctx, ctx.time.advance(DAY_LENGTH * 2));
  const state = householdStore.read(ctx);
  expect(state.day).toBe(2);
  expect(state.economy.cursors.upkeep!.fired).toBe(2);
  expect(state.credits).toBe(before - 194);
  expect(state.dayIncome).toBe(0);
  expect(state.order.every(id => state.members[id]!.recovering)).toBe(true);
  expect(notices.some(text => text.includes("unattended interval"))).toBe(true);
});

test("unpaid upkeep becomes debt without deleting the household; later savings repay it", () => {
  const ctx = boot();
  const state = householdStore.read(ctx);
  state.credits = 0;
  state.debt = 40;
  const furniture = ctx.scene.object.list().length;
  simulateHousehold(ctx, ctx.time.advance(DAY_LENGTH - ctx.time.now()));
  const insolvent = householdStore.read(ctx);
  expect(insolvent.credits).toBe(0);
  expect(insolvent.debt).toBe(137);
  expect(insolvent.order).toHaveLength(4);
  expect(ctx.scene.object.list()).toHaveLength(furniture);
  insolvent.credits = 200;
  simulateHousehold(ctx, ctx.time.advance(DAY_LENGTH));
  const recovering = householdStore.read(ctx);
  expect(recovering.debt).toBe(97);
  expect(recovering.credits).toBe(63);
  expect(recovering.lastDay!.bill).toBe(137);
});


test("Bloom crops exchange food for liquidity, lock on tending, and target the garden", () => {
  const results: { harvest:number; income:number }[] = [];
  for (const crop of ["pantry", "export"] as const) {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const member = state.members[state.order[1]!]!;
    state.story = { elapsed: 0, points: 0, nextAt: 1e9, lastFiredAt: {}, recent: [], fired: 0 };
    member.traits = ["kind", "handy"];
    ctx.time.hydrate({ ...ctx.time.snapshot(), now: DAY_LENGTH * 14 / 24 });
    member.needs = { hunger:95, energy:95, social:95, fun:70 };
    ctx.game.commands.run("member.bloomCrop", { id:member.id, crop });
    ctx.game.commands.run("member.direct", { id:member.id, goal:"play" });
    expect(member.action).toEqual({ kind:"seek", goal:"fun", objId:"starter:holo_arcade" });
    ctx.game.commands.run("member.direct", { id:member.id, goal:"tend" });
    expect(member.action).toEqual({ kind:"seek", goal:"fun", objId:"starter:bloom_planter" });
    const planter = ctx.scene.object.get("starter:bloom_planter")!;
    ctx.scene.entity.setPose(member.id, { position:[...planter.position] });
    // Other household members are resting; their income cannot disguise the chosen payout.
    for (const id of state.order) if (id !== member.id) {
      const other = state.members[id]!;
      other.action = { kind:"use", goal:"energy", objId:"starter:sleep_pod" };
      other.actionUntil = ctx.time.now() + 40;
    }
    advance(ctx, 1);
    expect(member.shiftProgress).toBeGreaterThan(0);
    ctx.game.commands.run("member.bloomCrop", { id:member.id, crop:crop === "pantry" ? "export" : "pantry" });
    expect(member.bloomCrop).toBe(crop);
    advance(ctx, 20);
    const after = householdStore.read(ctx);
    expect(member.completedShifts).toBe(1);
    results.push({ harvest:member.harvestToday, income:after.dayIncome });
  }
  expect(results).toEqual([{ harvest:4, income:48 },{ harvest:1, income:60 }]);
});

test("directed paid shifts explain closed windows instead of silently cancelling", () => {
  const ctx = boot();
  const member = householdStore.read(ctx).members["alien:1"]!;
  ctx.game.commands.run("member.direct", { id:member.id, goal:"tend" });
  expect(member.concern).toContain("window is closed");
  expect(member.action.kind).toBe("idle");
});

test("starting a Yield shift from the inspector journals it and shows the shift in progress", () => {
  const ctx = boot();
  const notices = noticeLog(ctx);
  const member = householdStore.read(ctx).members["alien:2"]!;
  ctx.game.commands.run("member.lifestyle", { id:member.id, lifestyle:"yield" });
  expect(shiftIsOpen(member, ctx.time.now())).toBe(true); // the fresh habitat clock opens at 09:00
  ctx.game.commands.run("member.direct", { id:member.id, goal:"work" });
  expect(notices).toContain(`${member.name} started a Yield shift.`);
  expect(yieldShiftLabel(member)).toBe("Heading to Yield Console");
  // Repeating the press keeps the same shift and does not journal it twice.
  ctx.game.commands.run("member.direct", { id:member.id, goal:"work" });
  expect(notices.filter(text => text.includes("started a Yield shift")).length).toBe(1);
  const console = ctx.scene.object.get("starter:work_console")!;
  ctx.scene.entity.setPose(member.id, { position:[...console.position] });
  advance(ctx, 1);
  expect(yieldShiftLabel(member)).toMatch(/^On shift · \d+s left$/);
});

test("a being with no furnished work station is told which furnishing fixes it", () => {
  const ctx = boot();
  const member = householdStore.read(ctx).members["alien:3"]!;
  ctx.game.commands.run("member.lifestyle", { id:member.id, lifestyle:"yield" });
  expect(shiftIsOpen(member, ctx.time.now())).toBe(true);
  ctx.scene.object.remove("starter:work_console");
  ctx.game.commands.run("member.direct", { id:member.id, goal:"work" });
  expect(member.concern).toBe("No work station — furnish a Yield Console (Furnish menu)");
  expect(member.action.kind).toBe("idle");
});

test("a second Yield worker sent to a full console reads as waiting, not heading there", () => {
  const ctx = boot();
  const state = householdStore.read(ctx);
  const [first, second] = [state.members["alien:2"]!, state.members["alien:3"]!];
  for (const member of [first, second]) ctx.game.commands.run("member.lifestyle", { id:member.id, lifestyle:"yield" });
  ctx.game.commands.run("member.direct", { id:first.id, goal:"work" });
  second.action = { kind:"seek", goal:"work", objId:"starter:work_console" };
  const objects = ctx.scene.object.list();
  expect(waitingForStation(state, first, objects)).toBe(false);
  expect(waitingForStation(state, second, objects)).toBe(true);
  expect(yieldShiftLabel(second, waitingForStation(state, second, objects))).toBe("Waiting for a free Yield Console");
});

function bond(ctx: GameContext, a: string, b: string, opinion: number, familiarity: number): void {
  const state = householdStore.read(ctx);
  state.relationships[pairKey(a, b)] = opinion;
  state.familiarity[pairKey(a, b)] = familiarity;
  householdStore.write(ctx, { ...state, members: { ...state.members } });
}

test("a bonded pair refuses to split a shift, then works side by side once a second station stands", () => {
  const ctx = boot();
  const state = householdStore.read(ctx);
  const first = state.members["alien:0"]!;
  const second = state.members["alien:2"]!;
  for (const member of [first, second]) ctx.game.commands.run("member.lifestyle", { id:member.id, lifestyle:"yield" });
  bond(ctx, first.id, second.id, 96, 0.9);
  const notices = noticeLog(ctx);
  expect(householdBook(state).refusesToSplit(first.id, second.id)).toBe(true);

  ctx.game.commands.run("member.direct", { id:first.id, goal:"work" });
  expect(first.action.kind).toBe("idle");
  expect(second.action.kind).toBe("idle");
  expect(first.concern).toContain("bonded and will not split");
  expect(first.concern).toContain("furnish a second Yield Console");
  expect(notices.some(text => text.includes("furnish a second Yield Console"))).toBe(true);

  ctx.scene.object.place("work_console", 8, 0, 8, { instanceId:"placed:work_console:1" });
  ctx.game.commands.run("member.direct", { id:first.id, goal:"work" });
  expect(first.action).toMatchObject({ kind:"seek", goal:"work" });
  expect(second.action).toMatchObject({ kind:"seek", goal:"work" });
  expect(first.action.kind === "seek" ? first.action.objId : null).not.toBe(second.action.kind === "seek" ? second.action.objId : null);
  expect(notices.some(text => text.includes("stay together"))).toBe(true);
});

test("a pair that never bonded still takes separate shifts", () => {
  const ctx = boot();
  const state = householdStore.read(ctx);
  const first = state.members["alien:0"]!;
  const second = state.members["alien:2"]!;
  for (const member of [first, second]) ctx.game.commands.run("member.lifestyle", { id:member.id, lifestyle:"yield" });
  ctx.game.commands.run("member.direct", { id:first.id, goal:"work" });
  expect(first.action).toEqual({ kind:"seek", goal:"work", objId:"starter:work_console" });
  expect(second.action.kind).toBe("idle");
});

test("a friend spends off-hours beside a friend instead of a random spot", () => {
  const ctx = boot();
  const state = householdStore.read(ctx);
  const follower = state.members["alien:1"]!;
  const friend = state.members["alien:3"]!;
  bond(ctx, follower.id, friend.id, 60, 0.6);
  for (const member of Object.values(state.members)) member.needs = { hunger:95, energy:95, social:95, fun:95 };
  ctx.time.hydrate({ ...ctx.time.snapshot(), now: DAY_LENGTH * 19 / 24 });
  householdStore.write(ctx, { ...state, members: { ...state.members } });
  expect(householdBook(state).prefersCompanyOf(follower.id, friend.id)).toBe(true);
  const friendAt = [...ctx.scene.entity.get(friend.id)!.position];
  advance(ctx, 0.25);
  expect(follower.action.kind).toBe("wander");
  if (follower.action.kind !== "wander") return;
  expect(Math.hypot(follower.action.x - friendAt[0], follower.action.z - friendAt[2])).toBeCloseTo(1.7, 1);
});

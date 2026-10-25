import { expect, test } from "bun:test";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { KeyValueStorage } from "@jgengine/core/game/keyValueStore";

import { DAY_LENGTH } from "../world";
import { game } from "../game.config";
import { registerCommands } from "./commands";
import { content } from "./content";
import {
  careerOf, careerView, coverageOf, promote, rungProgress, stationPay, yieldShiftValue,
} from "./careers";
import { householdStore } from "./session/store";
import { shiftLoop } from "./session/shiftSessions";
import { captureOrbitSave, ORBIT_SAVE_KEY, readOrbitSave, restoreOrbitSave, validOrbitSave, writeOrbitSave, type OrbitSave } from "./session/save";
import { pairKey } from "./session/types";
import { setupWorld } from "./sim/setup";
import { simulateHousehold } from "./sim/simulate";

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "orbit-career-test", isNew: true } });
  setupWorld(ctx);
  registerCommands(ctx);
  ctx.game.commands.define("orbit.checkpoint", { apply() {} });
  setGamePhase(ctx, "playing");
  return ctx;
}

function advance(ctx: GameContext, seconds: number, step = 0.5): void {
  let remaining = seconds;
  while (remaining > 1e-8) {
    const dt = Math.min(remaining, step);
    simulateHousehold(ctx, ctx.time.advance(dt));
    remaining -= dt;
  }
}

/** Put one being on the starter console and let a full 20-second shift run. */
function workShift(ctx: GameContext, id: string): void {
  const state = householdStore.read(ctx);
  const member = state.members[id]!;
  member.needs = { hunger: 95, energy: 95, social: 95, fun: 95 };
  member.job = "Signal-keeper";
  member.lifestyle = "yield";
  member.workToday = 0;
  member.shiftDay = -1;
  // A shift is one session a day on the shared loop: reset it the way a new day would.
  shiftLoop(ctx, id).restore({ session: 0, closed: 0, carried: 0, optionId: null });
  member.action = { kind: "use", goal: "work", objId: "starter:work_console" };
  member.assignedByPlayer = true;
  member.actionUntil = ctx.time.now() + 40;
  householdStore.write(ctx, { ...state, members: { ...state.members } });
  advance(ctx, 20.5);
}

function memory(raw?: string): { storage: KeyValueStorage; values: Map<string, string> } {
  const values = new Map<string, string>(raw === undefined ? [] : [[ORBIT_SAVE_KEY, raw]]);
  return { values, storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } } };
}

test("household standing gates the next rung and a purchase raises the shift's pay", () => {
  const ctx = boot();
  const state = householdStore.read(ctx);
  const member = state.members["alien:0"]!;
  expect(careerOf(member).id).toBe("Signal-keeper");
  expect(rungProgress(state, member)).toMatchObject({ rung: 1, nextRung: 2, canPromote: false, needs: 3, have: 0 });
  expect(promote(state, member)).toMatchObject({ ok: false });
  const before = yieldShiftValue(state, member);
  expect(before).toBe(100);

  state.standing = { records: { [member.id]: { orbit: 4, yield: 4 } } };
  householdStore.write(ctx, { ...state });
  const loaded = householdStore.read(ctx);
  expect(rungProgress(loaded, member).canPromote).toBe(true);
  const bought = promote(loaded, member);
  expect(bought).toMatchObject({ ok: true, rung: 2 });
  householdStore.write(ctx, { ...loaded });

  const after = yieldShiftValue(householdStore.read(ctx), member);
  expect(after).toBeGreaterThan(before);
  // 5 credits a second x Adept (1.15) x Skilled mastery (1.10) x 20 seconds.
  expect(after).toBe(126.5);
});

test("working a shift raises station mastery and the next shift pays more", () => {
  const ctx = boot();
  workShift(ctx, "alien:0");
  const state = householdStore.read(ctx);
  const member = state.members["alien:0"]!;
  expect(state.standing?.records[member.id]).toEqual({ yield: 1, orbit: 1 });
  expect(member.completedShifts).toBe(1);
  expect(yieldShiftValue(state, member)).toBe(105);

  const credits = state.credits;
  workShift(ctx, "alien:0");
  const paid = householdStore.read(ctx).credits - credits;
  expect(paid).toBe(105);
  expect(householdStore.read(ctx).standing?.records[member.id]?.yield).toBe(2);
});

test("ten shifts at a station pay more than three", () => {
  const ctx = boot();
  const state = householdStore.read(ctx);
  const member = state.members["alien:0"]!;
  state.standing = { records: { [member.id]: { yield: 3 } } };
  const practiced = yieldShiftValue(state, member);
  state.standing = { records: { [member.id]: { yield: 10 } } };
  const veteran = yieldShiftValue(state, member);
  expect(veteran).toBeGreaterThan(practiced);
  expect([practiced, veteran]).toEqual([105, 115]);
  expect(stationPay(state, member, "yield")).toMatchObject({ masteryLevel: 4, masteryLabel: "IV" });
});

test("a bonded pair's refusal to split overrides a career assignment", () => {
  const ctx = boot();
  const state = householdStore.read(ctx);
  const a = state.members["alien:0"]!;
  const b = state.members["alien:2"]!;
  state.relationships[pairKey(a.id, b.id)] = 97;
  state.familiarity[pairKey(a.id, b.id)] = 0.9;
  householdStore.write(ctx, { ...state, members: { ...state.members } });

  ctx.game.commands.run("member.career", { id: a.id, career: "Botanist" });
  const after = householdStore.read(ctx);
  expect(after.members[a.id]!.job).toBe("Signal-keeper");
  expect(after.members[a.id]!.lifestyle).toBe("yield");
  expect(after.members[a.id]!.concern).toContain("bonded and will not take separate posts");
});

test("a post gates the other station until the cross-trained rung pays cover", () => {
  const ctx = boot();
  const state = householdStore.read(ctx);
  const member = state.members["alien:0"]!;
  expect(coverageOf(careerView(state), member, "bloom").ok).toBe(false);
  expect(coverageOf(careerView(state), member, "yield").ok).toBe(true);

  ctx.time.hydrate({ ...ctx.time.snapshot(), now: DAY_LENGTH * 14 / 24 });
  member.lifestyle = "bloom";
  householdStore.write(ctx, { ...state, members: { ...state.members } });
  ctx.game.commands.run("member.direct", { id: member.id, goal: "tend" });
  expect(member.concern).toContain("cannot cover the Bloom Planter");

  state.standing = { records: { [member.id]: { orbit: 4 } } };
  householdStore.write(ctx, { ...state, members: { ...state.members } });
  expect(promote(householdStore.read(ctx), member)).toMatchObject({ ok: true, rung: 2 });
  householdStore.write(ctx, { ...householdStore.read(ctx), members: { ...householdStore.read(ctx).members } });

  const crossed = householdStore.read(ctx);
  expect(coverageOf(careerView(crossed), member, "bloom").ok).toBe(true);
  expect(stationPay(crossed, member, "bloom").careerFactor).toBe(0.9);
  ctx.game.commands.run("member.direct", { id: member.id, goal: "tend" });
  const sent = householdStore.read(ctx).members[member.id]!;
  expect(sent.action.kind === "seek" || sent.action.kind === "use").toBe(true);
});

test("post rungs and mastery survive a save and reload", () => {
  const ctx = boot();
  const state = householdStore.read(ctx);
  const member = state.members["alien:0"]!;
  state.standing = { records: { [member.id]: { yield: 6, orbit: 6 } } };
  householdStore.write(ctx, { ...state });
  expect(promote(householdStore.read(ctx), member)).toMatchObject({ ok: true, rung: 2 });
  householdStore.write(ctx, { ...householdStore.read(ctx) });

  const { storage } = memory();
  expect(writeOrbitSave(ctx, storage)).toBe(true);
  const second = boot();
  restoreOrbitSave(second, readOrbitSave(storage).save!);
  const loaded = householdStore.read(second);
  expect(rungProgress(loaded, loaded.members[member.id]!).rung).toBe(2);
  expect(yieldShiftValue(loaded, loaded.members[member.id]!)).toBe(yieldShiftValue(householdStore.read(ctx), member));
  expect(validOrbitSave(captureOrbitSave(second))).toBe(true);
});

test("a v1 save without posts loads and lines each post up with its rhythm", () => {
  const first = boot();
  const legacy = structuredClone(captureOrbitSave(first)) as OrbitSave & { household: Record<string, any> };
  delete legacy.household.standing;
  delete legacy.household.careers;
  legacy.household.members["alien:0"].job = "Botanist";
  expect(validOrbitSave(legacy)).toBe(true);
  const second = boot();
  restoreOrbitSave(second, legacy as OrbitSave);
  const loaded = householdStore.read(second);
  expect(loaded.members["alien:0"]!.lifestyle).toBe("yield");
  expect(loaded.members["alien:0"]!.job).toBe("Signal-keeper");
  expect(loaded.standing).toEqual({ records: {} });
  expect(loaded.careers).toEqual({ ranks: {} });
  expect(validOrbitSave(captureOrbitSave(second))).toBe(true);
  simulateHousehold(second, second.time.advance(1));
});

test("unknown posts, tracks and beings are rejected before loading", () => {
  const save = captureOrbitSave(boot());
  const badRank = structuredClone(save) as OrbitSave & { household: Record<string, any> };
  badRank.household.careers.ranks["post:Nope:2"] = 1;
  expect(validOrbitSave(badRank)).toBe(false);
  const badTrack = structuredClone(save) as OrbitSave & { household: Record<string, any> };
  badTrack.household.standing.records["alien:0"] = { dance: 3 };
  expect(validOrbitSave(badTrack)).toBe(false);
  const badActor = structuredClone(save) as OrbitSave & { household: Record<string, any> };
  badActor.household.standing.records["alien:9"] = { yield: 3 };
  expect(validOrbitSave(badActor)).toBe(false);
});

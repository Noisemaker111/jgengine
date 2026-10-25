import { expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { DAY_LENGTH } from "../../world";
import { game } from "../../game.config";
import { content } from "../content";
import { captureOrbitSave, restoreOrbitSave, validOrbitSave } from "../session/save";
import { householdStore } from "../session/store";
import { dailyUpkeep, settleHouseholdDay, TERM_RENT } from "./economy";
import { GRANT_PER_GOAL } from "./charter";
import { setupWorld } from "./setup";
import { simulateHousehold } from "./simulate";

function boot(credits = 1000, debt = 40) {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "catchup-test", isNew: true } });
  setupWorld(ctx);
  const state = householdStore.read(ctx);
  state.credits = credits;
  state.debt = debt;
  return { ctx, state, objects: ctx.scene.object.list() };
}

test("three overdue bills repay only the remaining debt", () => {
  for (const debt of [40, 90]) {
    const { ctx, state, objects } = boot(1000, debt);
    settleHouseholdDay(state, objects, DAY_LENGTH * 3, ctx.game.notices);
    expect(state.credits).toBe(1000 - dailyUpkeep(objects) * 3 - debt);
    expect(state.debt).toBe(0);
    expect(state.economy.cursors.upkeep!.fired).toBe(3);
    ctx.game.save?.dispose();
  }
});

test("the actual unattended simulation preserves repayment through save and resume", () => {
  const { ctx, objects } = boot();
  simulateHousehold(ctx, ctx.time.advance(DAY_LENGTH * 3 - ctx.time.now()));
  const expected = 1000 - dailyUpkeep(objects) * 3 - 40;
  expect(householdStore.read(ctx).credits).toBe(expected);
  expect(householdStore.read(ctx).debt).toBe(0);
  const saved = captureOrbitSave(ctx);
  expect(validOrbitSave(saved)).toBe(true);
  const resumed = boot().ctx;
  restoreOrbitSave(resumed, JSON.parse(JSON.stringify(saved)));
  simulateHousehold(resumed, resumed.time.advance(0.25));
  expect(householdStore.read(resumed).credits).toBe(expected);
  expect(householdStore.read(resumed).debt).toBe(0);
  ctx.game.save?.dispose(); resumed.game.save?.dispose();
});

test("a bounded settlement persists its unpaid cycles and finishes them after reload", () => {
  const { ctx, state, objects } = boot(10000, 0);
  ctx.time.advance(DAY_LENGTH * 10 - ctx.time.now());
  settleHouseholdDay(state, objects, ctx.time.now(), ctx.game.notices);
  expect(state.economy.cursors.upkeep!.fired).toBe(7);
  expect(state.economy.cursors.upkeep!.nextDueSeconds).toBe(DAY_LENGTH * 8);
  const saved = captureOrbitSave(ctx);
  expect(validOrbitSave(saved)).toBe(true);
  const resumed = boot().ctx;
  restoreOrbitSave(resumed, JSON.parse(JSON.stringify(saved)));
  simulateHousehold(resumed, resumed.time.advance(0.25));
  const restored = householdStore.read(resumed);
  expect(restored.economy.cursors.upkeep!.fired).toBe(10);
  expect(restored.credits).toBe(10000 - dailyUpkeep(objects) * 10);
  expect(restored.lastDay!.bill).toBe(dailyUpkeep(objects) * 10);
  const settledCredits = restored.credits;
  simulateHousehold(resumed, resumed.time.advance(0.25));
  expect(householdStore.read(resumed).credits).toBe(settledCredits);
  ctx.game.save?.dispose(); resumed.game.save?.dispose();
});

test("a large unattended gap charges all ten bills without replaying paid work", () => {
  const { ctx, objects } = boot(10000, 0);
  simulateHousehold(ctx, ctx.time.advance(DAY_LENGTH * 10 - ctx.time.now()));
  expect(householdStore.read(ctx).economy.cursors.upkeep!.fired).toBe(10);
  // The first settlement catches up seven bills at term one's rent and closes that term; the last
  // three carry term two's rent and close it too. Each review pays its grant.
  const charter = householdStore.read(ctx).charter!;
  expect(charter.term).toBe(2);
  const grants = GRANT_PER_GOAL * (charter.stars[0]! + charter.stars[1]!);
  expect(householdStore.read(ctx).credits).toBe(10000 - dailyUpkeep(objects) * 7 - dailyUpkeep(objects, TERM_RENT[1]) * 3 + grants);
  expect(householdStore.read(ctx).dayIncome).toBe(0);
  ctx.game.save?.dispose();
});

test("each settlement stays bounded even when hundreds of bills are overdue", () => {
  const { ctx, state, objects } = boot(100000, 0);
  settleHouseholdDay(state, objects, DAY_LENGTH * 500, ctx.game.notices);
  expect(state.economy.cursors.upkeep!.fired).toBe(7);
  settleHouseholdDay(state, objects, DAY_LENGTH * 500, ctx.game.notices);
  expect(state.economy.cursors.upkeep!.fired).toBe(14);
  expect(state.economy.cursors.upkeep!.nextDueSeconds).toBe(DAY_LENGTH * 15);
  expect(state.credits).toBe(100000 - dailyUpkeep(objects) * 14);
  ctx.game.save?.dispose();
});

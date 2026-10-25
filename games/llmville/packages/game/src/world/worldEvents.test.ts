import { describe, expect, it } from "bun:test";
import {
  computeCozyEventReward,
  COZY_EVENTS,
  decideCozyEventSpawn,
  EVENT_REWARD_BASE,
  EVENT_REWARD_MAX,
  EVENT_REWARD_MIN,
  EVENT_SPAWN_COOLDOWN_MS,
} from "./worldEvents";

describe("decideCozyEventSpawn", () => {
  it("skips when an unresolved event already exists", () => {
    const decision = decideCozyEventSpawn({
      hasUnresolvedEvent: true,
      lastEventSpawnAt: 0,
      now: EVENT_SPAWN_COOLDOWN_MS + 1,
      rngUnit: 0,
      servingIncomePerHour: 0,
    });
    expect(decision).toEqual({ kind: "skip" });
  });

  it("skips while inside the cooldown window", () => {
    const decision = decideCozyEventSpawn({
      hasUnresolvedEvent: false,
      lastEventSpawnAt: 1_000,
      now: 1_000 + EVENT_SPAWN_COOLDOWN_MS - 1,
      rngUnit: 0,
      servingIncomePerHour: 0,
    });
    expect(decision).toEqual({ kind: "skip" });
  });

  it("spawns exactly at the cooldown boundary", () => {
    const decision = decideCozyEventSpawn({
      hasUnresolvedEvent: false,
      lastEventSpawnAt: 1_000,
      now: 1_000 + EVENT_SPAWN_COOLDOWN_MS,
      rngUnit: 0,
      servingIncomePerHour: 0,
    });
    expect(decision.kind).toBe("spawn");
  });

  it("picks the first event for rngUnit 0", () => {
    const decision = decideCozyEventSpawn({
      hasUnresolvedEvent: false,
      lastEventSpawnAt: 0,
      now: EVENT_SPAWN_COOLDOWN_MS,
      rngUnit: 0,
      servingIncomePerHour: 0,
    });
    expect(decision).toEqual({ kind: "spawn", event: COZY_EVENTS[0], rewardMoney: 15 });
  });

  it("picks the last event for rngUnit just under 1", () => {
    const decision = decideCozyEventSpawn({
      hasUnresolvedEvent: false,
      lastEventSpawnAt: 0,
      now: EVENT_SPAWN_COOLDOWN_MS,
      rngUnit: 0.9999999,
      servingIncomePerHour: 0,
    });
    expect(decision).toEqual({
      kind: "spawn",
      event: COZY_EVENTS[COZY_EVENTS.length - 1],
      rewardMoney: 15,
    });
  });

  it("picks a middle event for a mid-range rngUnit", () => {
    const index = Math.floor(0.5 * COZY_EVENTS.length);
    const decision = decideCozyEventSpawn({
      hasUnresolvedEvent: false,
      lastEventSpawnAt: 0,
      now: EVENT_SPAWN_COOLDOWN_MS,
      rngUnit: 0.5,
      servingIncomePerHour: 0,
    });
    expect(decision).toEqual({ kind: "spawn", event: COZY_EVENTS[index], rewardMoney: 15 });
  });
});

describe("computeCozyEventReward", () => {
  it("gives a small top-up to a lab with no income", () => {
    expect(computeCozyEventReward(0)).toBe(EVENT_REWARD_BASE);
  });

  it("scales with a tenth of hourly serving income", () => {
    expect(computeCozyEventReward(200)).toBe(35);
  });

  it("clamps to the reward band", () => {
    expect(computeCozyEventReward(-100)).toBe(EVENT_REWARD_MIN);
    expect(computeCozyEventReward(1_000_000)).toBe(EVENT_REWARD_MAX);
  });
});

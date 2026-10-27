import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createMissionRuntime, type MissionEvent } from "@jgengine/core/mission/mission";

import { FIRST_SCENARIO, SCENARIOS, recordScenarioWin, scenarioDef, scenarioLock, scenarioSeconds } from "./scenarios";
import { MONTH_DAYS } from "./books";
import { DAY_LENGTH } from "./catalog";

function runtime() {
  return createMissionRuntime({ missions: SCENARIOS.map((scenario) => scenario.mission) });
}

/** The world facts a scenario's mission reads, named as the park world holds them. */
function facts(patch: Partial<Record<"guests" | "rating" | "mood", number>> = {}) {
  const at = { guests: 0, rating: 0, mood: 60, ...patch };
  return { "park.guests": at.guests, "park.rating": at.rating, "park.mood": at.mood };
}

const kinds = (events: readonly MissionEvent[]) => events.map((event) => event.kind);

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
beforeEach(() => {
  const records = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  } });
});
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

describe("brightway-park scenarios on the shared mission runtime", () => {
  test("every scenario is authored content the runtime accepts at load, a season or more long", () => {
    expect(SCENARIOS.length).toBe(3);
    expect(runtime().missionIds()).toEqual(SCENARIOS.map((scenario) => scenario.id));
    for (const scenario of SCENARIOS) expect(scenarioDef(scenario.id)).not.toBeNull();
    // Three months, a season, two seasons: hours of play at 1x.
    expect(SCENARIOS.map((scenario) => scenario.months)).toEqual([3, 8, 16]);
    expect(scenarioSeconds(3)).toBe(3 * MONTH_DAYS * DAY_LENGTH);
    expect(scenarioDef(FIRST_SCENARIO)?.goal).toBe("120 guests in the park and 400 stars by the end of May, Year 1");
  });

  test("Brightway Beginnings is won the moment both targets hold, not before", () => {
    const park = runtime();
    park.start(FIRST_SCENARIO);
    expect(kinds(park.tick(60, { facts: facts({ guests: 150, rating: 300 }) }))).not.toContain("completed");
    expect(kinds(park.tick(60, { facts: facts({ guests: 119, rating: 450 }) }))).not.toContain("completed");
    const won = park.tick(60, { facts: facts({ guests: 120, rating: 400 }) });
    expect(kinds(won)).toContain("completed");
    const reward = won.find((event) => event.kind === "reward");
    if (reward?.kind === "reward") expect(reward.rewards.economy).toEqual({ cash: 5000 });
    else throw new Error("no reward");
  });

  test("the end of May closes a short park in its own fail state", () => {
    const park = runtime();
    park.start(FIRST_SCENARIO);
    expect(kinds(park.tick(scenarioSeconds(3) - 10, { facts: facts({ guests: 80, rating: 300 }) }))).not.toContain("failed");
    const failed = park.tick(20, { facts: facts({ guests: 80, rating: 300 }) }).find((event) => event.kind === "failed");
    expect(failed?.kind === "failed" ? failed.state : "").toBe("short");
  });

  test("a miserable crowd fails a run before its deadline", () => {
    const park = runtime();
    park.start("star_attraction");
    const failed = park.tick(10, { facts: facts({ mood: 15 }) }).find((event) => event.kind === "failed");
    expect(failed?.kind === "failed" ? failed.state : "").toBe("walkout");
  });

  test("scenarios unlock in order: winning one opens the next", () => {
    expect(scenarioLock(FIRST_SCENARIO)).toBeNull();
    expect(scenarioLock("star_attraction")).toContain("Brightway Beginnings");
    expect(scenarioLock("full_house")).toContain("Star Attraction");
    recordScenarioWin(FIRST_SCENARIO);
    expect(scenarioLock("star_attraction")).toBeNull();
    expect(scenarioLock("full_house")).not.toBeNull();
  });
});

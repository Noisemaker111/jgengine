import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createMissionRuntime, type MissionEvent } from "@jgengine/core/mission/mission";

import { FIRST_SCENARIO, SCENARIOS, recordScenarioWin, scenarioDef, scenarioLock, scenarioSeconds } from "./scenarios";
import { MONTH_DAYS } from "./books";
import { DAY_LENGTH } from "./catalog";

function runtime() {
  return createMissionRuntime({ missions: SCENARIOS.map((scenario) => scenario.mission) });
}

/** The world facts a scenario's mission reads, named as the park world holds them. */
function facts(patch: Partial<Record<"screams" | "rating" | "ghosts" | "mood", number>> = {}) {
  const at = { screams: 0, rating: 0, ghosts: 0, mood: 60, ...patch };
  return { "park.screams": at.screams, "park.rating": at.rating, "park.ghosts": at.ghosts, "park.mood": at.mood };
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

describe("hauntworks scenarios on the shared mission runtime", () => {
  test("every scenario is authored content the runtime accepts at load, a season or more long", () => {
    expect(SCENARIOS.length).toBe(3);
    expect(runtime().missionIds()).toEqual(SCENARIOS.map((scenario) => scenario.id));
    for (const scenario of SCENARIOS) expect(scenarioDef(scenario.id)).not.toBeNull();
    // Three moons, a season, two seasons: hours of play at 1x. The last is the Full Moon Festival.
    expect(SCENARIOS.map((scenario) => scenario.months)).toEqual([3, 8, 16]);
    expect(SCENARIOS.at(-1)?.title).toBe("Full Moon Festival");
    expect(scenarioSeconds(3)).toBe(3 * MONTH_DAYS * DAY_LENGTH);
    expect(scenarioDef(FIRST_SCENARIO)?.goal).toBe("60 of the living driven out screaming, 300 rumor, 1 ghost in residence by the end of the Frost Moon, season 1");
  });

  test("The First Chill is won the moment every target holds, not before", () => {
    const park = runtime();
    park.start(FIRST_SCENARIO);
    expect(kinds(park.tick(60, { facts: facts({ screams: 90, rating: 400, ghosts: 0 }) }))).not.toContain("completed");
    expect(kinds(park.tick(60, { facts: facts({ screams: 59, rating: 450, ghosts: 2 }) }))).not.toContain("completed");
    expect(kinds(park.tick(60, { facts: facts({ screams: 80, rating: 299, ghosts: 1 }) }))).not.toContain("completed");
    const won = park.tick(60, { facts: facts({ screams: 60, rating: 300, ghosts: 1 }) });
    expect(kinds(won)).toContain("completed");
    const reward = won.find((event) => event.kind === "reward");
    if (reward?.kind === "reward") expect(reward.rewards.economy).toEqual({ cash: 5000 });
    else throw new Error("no reward");
  });

  test("the end of the third moon closes a short haunt in its own fail state", () => {
    const park = runtime();
    park.start(FIRST_SCENARIO);
    expect(kinds(park.tick(scenarioSeconds(3) - 10, { facts: facts({ screams: 40, rating: 300, ghosts: 1 }) }))).not.toContain("failed");
    const failed = park.tick(20, { facts: facts({ screams: 40, rating: 300, ghosts: 1 }) }).find((event) => event.kind === "failed");
    expect(failed?.kind === "failed" ? failed.state : "").toBe("short");
  });

  test("a miserable crowd fails a run before its deadline", () => {
    const park = runtime();
    park.start("talk_of_the_coast");
    const failed = park.tick(10, { facts: facts({ mood: 15 }) }).find((event) => event.kind === "failed");
    expect(failed?.kind === "failed" ? failed.state : "").toBe("walkout");
  });

  test("scenarios unlock in order: winning one opens the next", () => {
    expect(scenarioLock(FIRST_SCENARIO)).toBeNull();
    expect(scenarioLock("talk_of_the_coast")).toContain("The First Chill");
    expect(scenarioLock("full_moon_festival")).toContain("Talk of the Coast");
    recordScenarioWin(FIRST_SCENARIO);
    expect(scenarioLock("talk_of_the_coast")).toBeNull();
    expect(scenarioLock("full_moon_festival")).not.toBeNull();
  });
});

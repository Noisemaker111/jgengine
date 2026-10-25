import { describe, expect, test } from "bun:test";

import { createMissionRuntime, type MissionEvent } from "@jgengine/core/mission/mission";

import { SCENARIOS, scenarioDef } from "./scenarios";
import { DAY_LENGTH } from "./catalog";

function runtime() {
  return createMissionRuntime({ missions: SCENARIOS.map((scenario) => scenario.mission) });
}

/** The world facts a scenario's mission reads, named as the park world holds them. */
function facts(patch: Partial<Record<"cash" | "rating" | "mood" | "visitors" | "revenue", number>> = {}) {
  const at = { cash: 5000, rating: 0, mood: 60, visitors: 0, revenue: 0, ...patch };
  return { "park.cash": at.cash, "park.rating": at.rating, "park.mood": at.mood, "park.scenario_visitors": at.visitors, "park.scenario_revenue": at.revenue };
}

const kinds = (events: readonly MissionEvent[]) => events.map((event) => event.kind);

describe("brightway-park scenarios on the shared mission runtime", () => {
  test("every scenario is authored content the runtime accepts at load", () => {
    expect(SCENARIOS.length).toBe(3);
    expect(runtime().missionIds()).toEqual(SCENARIOS.map((scenario) => scenario.id));
    for (const scenario of SCENARIOS) expect(scenarioDef(scenario.id)).not.toBeNull();
  });

  test("Opening Weekend closes short of $2,000 and fails the run", () => {
    const park = runtime();
    park.start("opening_weekend");
    const events = park.tick(DAY_LENGTH * 2, { facts: facts({ revenue: 1999, cash: 4000 }) });
    expect(kinds(events)).toContain("failed");
    const failed = events.find((event) => event.kind === "failed")!;
    expect(failed.state).toBe("short");
    expect(park.state()!.status).toBe("failed");
    expect(park.view()!.outcome).toBe("short");
  });

  test("Opening Weekend is won when the gate has taken $2,000", () => {
    const park = runtime();
    park.start("opening_weekend");
    const events = park.tick(DAY_LENGTH * 2, { facts: facts({ revenue: 2000 }) });
    expect(kinds(events)).toContain("completed");
    expect(park.state()!.status).toBe("completed");
  });

  test("a dry till fails a run immediately, before its deadline", () => {
    const park = runtime();
    park.start("opening_weekend");
    const events = park.tick(1, { facts: facts({ cash: 0, revenue: 300 }) });
    const failed = events.find((event) => event.kind === "failed")!;
    expect(failed.state).toBe("broke");
    expect(failed.reason).toContain("till ran dry");
  });

  test("Star Attraction fails when the crowd turns miserable, and wins at 420 stars", () => {
    const park = runtime();
    park.start("star_attraction");
    const walked = park.tick(10, { facts: facts({ mood: 20 }) });
    expect(walked.find((event) => event.kind === "failed")!.state).toBe("walkout");

    const second = runtime();
    second.start("star_attraction");
    const won = second.tick(DAY_LENGTH * 3, { facts: facts({ rating: 450, mood: 70 }) });
    expect(kinds(won)).toContain("completed");
  });

  test("Full House needs 80 visitors inside one day", () => {
    const quiet = runtime();
    quiet.start("full_house");
    const thin = quiet.tick(DAY_LENGTH, { facts: facts({ visitors: 79 }) });
    expect(thin.find((event) => event.kind === "failed")!.state).toBe("thin");

    const busy = runtime();
    busy.start("full_house");
    const won = busy.tick(DAY_LENGTH, { facts: facts({ visitors: 80 }) });
    expect(kinds(won)).toContain("completed");
  });

  test("a won scenario pays its authored reward once", () => {
    const park = runtime();
    park.start("full_house");
    const events = park.tick(DAY_LENGTH, { facts: facts({ visitors: 90 }) });
    const reward = events.find((event) => event.kind === "reward");
    expect(reward).toBeDefined();
    if (reward?.kind === "reward") expect(reward.rewards.economy).toEqual({ cash: 1800 });
  });
});

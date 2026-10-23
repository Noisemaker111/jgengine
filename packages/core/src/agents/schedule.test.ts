import { describe, expect, test } from "bun:test";

import { createAgentSchedule } from "./schedule";

function parkDay() {
  return createAgentSchedule({
    cycleSeconds: 240,
    stops: [
      { place: "home", arriveAt: 0, activity: "sleep" },
      {
        place: "lobby",
        arriveAt: 60,
        activity: "work",
        beat: ["hall-a", "hall-b", "hall-c", "hall-d"],
        beatDwellSeconds: 10,
      },
      { place: "cafe", arriveAt: 180, activity: "meal", refill: { hunger: 40 } },
    ],
    travelSeconds: (from, to) => (from === to ? 0 : 5),
  });
}

describe("createAgentSchedule", () => {
  test("a work stop walks its beat in order, then wraps", () => {
    const day = parkDay();
    expect(day.phaseAt(65).post).toBe("hall-a");
    expect(day.phaseAt(75).post).toBe("hall-b");
    expect(day.phaseAt(95).post).toBe("hall-d");
    expect(day.phaseAt(105).post).toBe("hall-a");
    expect(day.phaseAt(65).activity).toBe("work");
  });

  test("a stop without a beat posts the agent at the stop's own place", () => {
    const day = parkDay();
    expect(day.phaseAt(10).post).toBe("home");
    expect(day.phaseAt(10).activity).toBe("sleep");
    expect(day.phaseAt(200).post).toBe("cafe");
  });

  test("travel has no post, and the next change is the first beat step", () => {
    const day = parkDay();
    const walking = day.phaseAt(57);
    expect(walking.travelling).toBe(true);
    expect(walking.post).toBeNull();
    expect(walking.nextPlace).toBe("lobby");
    expect(day.nextChangeAfter(65)).toBe(70);
    expect(day.nextChangeAfter(57)).toBeCloseTo(60, 6);
  });

  test("a stop carries the needs it refills an agent with", () => {
    const day = parkDay();
    expect(day.phaseAt(200).refill).toEqual({ hunger: 40 });
    expect(day.phaseAt(10).refill).toBeNull();
  });

  test("the day wraps on the clock, so a far agent and a loaded one read the same plan", () => {
    const day = parkDay();
    expect(day.phaseAt(245).activity).toBe("sleep");
    expect(day.phaseAt(305).post).toBe("hall-a");
    expect(day.phaseAt(305)).toEqual({ ...day.phaseAt(65), since: day.phaseAt(305).since, until: day.phaseAt(305).until });
  });

  test("an impossible plan throws instead of putting the agent in two places", () => {
    expect(() =>
      createAgentSchedule({
        cycleSeconds: 30,
        stops: [
          { place: "a", arriveAt: 0, activity: "work" },
          { place: "b", arriveAt: 10, activity: "work" },
        ],
        travelSeconds: () => 60,
      }),
    ).toThrow(/does not fit/);
  });
});

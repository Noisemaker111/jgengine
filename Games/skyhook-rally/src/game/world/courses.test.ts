import { describe, expect, test } from "bun:test";
import { createRaceState, firstPastPost, raceTrack } from "@jgengine/core/game/race";

import { buildCourses, medalFor, streakBonusSeconds, type CourseDef } from "./courses";
import { generateArchipelago } from "./archipelago";

const archipelago = generateArchipelago("courses-test-seed");
const courses = buildCourses(archipelago);

describe("buildCourses", () => {
  test("authors exactly three courses: loop, climb, descent", () => {
    expect(courses.map((c) => c.kind)).toEqual(["loop", "climb", "descent"]);
  });

  test("hits the brief's ring counts (8 / 12 / 10)", () => {
    const [loop, climb, descent] = courses;
    expect(loop!.checkpoints.length).toBe(8);
    expect(climb!.checkpoints.length).toBe(12);
    expect(descent!.checkpoints.length).toBe(10);
  });

  const pylonById = new Map(archipelago.pylons.map((p) => [p.id, p] as const));

  test("the climb course visits islets in strictly ascending altitude order", () => {
    const climb = courses.find((c) => c.kind === "climb")!;
    const heights = climb.pylonIds.map((id) => pylonById.get(id)!.base.y);
    for (let i = 1; i < heights.length; i += 1) expect(heights[i]!).toBeGreaterThanOrEqual(heights[i - 1]!);
  });

  test("the descent course visits islets in strictly descending altitude order", () => {
    const descent = courses.find((c) => c.kind === "descent")!;
    const heights = descent.pylonIds.map((id) => pylonById.get(id)!.base.y);
    for (let i = 1; i < heights.length; i += 1) expect(heights[i]!).toBeLessThanOrEqual(heights[i - 1]!);
  });

  test("the loop course returns to its starting pylon", () => {
    const loop = courses.find((c) => c.kind === "loop")!;
    const first = loop.checkpoints[0]!;
    const last = loop.checkpoints[loop.checkpoints.length - 1]!;
    expect(last.center).toEqual(first.center);
  });

  test("par is always below the total time cap, and medal thresholds widen monotonically", () => {
    for (const course of courses) {
      expect(course.parSeconds).toBeLessThan(course.totalTimeCapSeconds);
      expect(course.medals.gold).toBeLessThan(course.medals.silver);
      expect(course.medals.silver).toBeLessThan(course.medals.bronze);
    }
  });
});

describe("medalFor", () => {
  const course: CourseDef = courses[0]!;

  test("gold at or under par", () => {
    expect(medalFor(course, course.medals.gold)).toBe("gold");
    expect(medalFor(course, course.medals.gold - 1)).toBe("gold");
  });

  test("silver between gold and silver thresholds", () => {
    expect(medalFor(course, course.medals.gold + 0.5)).toBe("silver");
  });

  test("bronze between silver and bronze thresholds", () => {
    expect(medalFor(course, course.medals.silver + 0.5)).toBe("bronze");
  });

  test("no medal past the bronze threshold", () => {
    expect(medalFor(course, course.medals.bronze + 1)).toBe("none");
  });
});

describe("streakBonusSeconds", () => {
  test("grows with streak and caps at the configured maximum", () => {
    expect(streakBonusSeconds(0)).toBe(0);
    expect(streakBonusSeconds(3)).toBeCloseTo(0.6, 5);
    expect(streakBonusSeconds(100)).toBe(5);
  });
});

describe("a course's checkpoints drive game/race correctly", () => {
  test("hitting every checkpoint in order finishes the race", () => {
    const course = courses.find((c) => c.kind === "loop")!;
    const track = raceTrack({ checkpoints: course.checkpoints, laps: 1 });
    const race = createRaceState({ track, win: firstPastPost(1) });
    race.addRacer("courier", 0);

    let now = 0;
    for (const checkpoint of course.checkpoints) {
      now += 1;
      race.update(now, { courier: checkpoint.center });
    }

    expect(race.finished).toBe(true);
    expect(race.ranking).toEqual(["courier"]);
    const progress = race.progressOf("courier");
    expect(progress?.finished).toBe(true);
    expect(progress?.splits.length).toBe(course.checkpoints.length);
  });
});

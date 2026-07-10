import { describe, expect, test } from "bun:test";

import { activeGust, createAmbientWind, generateGustSchedule, gustCountFor, windAt } from "./wind";

describe("generateGustSchedule — determinism", () => {
  test("the same seed produces an identical schedule", () => {
    const a = generateGustSchedule("course-a", 200);
    const b = generateGustSchedule("course-a", 200);
    expect(a).toEqual(b);
  });

  test("a different seed produces a different schedule", () => {
    const a = generateGustSchedule("course-a", 200);
    const b = generateGustSchedule("course-b", 200);
    expect(a).not.toEqual(b);
  });

  test("always schedules at least 6 gusts per run", () => {
    expect(generateGustSchedule("short-run", 50).length).toBeGreaterThanOrEqual(6);
    expect(gustCountFor(50)).toBeGreaterThanOrEqual(6);
  });

  test("gusts stay within the run duration and hold a positive duration", () => {
    const schedule = generateGustSchedule("course-a", 220);
    for (const gust of schedule) {
      expect(gust.startSec).toBeGreaterThanOrEqual(0);
      expect(gust.startSec).toBeLessThan(220);
      expect(gust.durationSec).toBeGreaterThan(0);
    }
  });
});

describe("activeGust / windAt", () => {
  test("no gust is active before the schedule starts or after it fully ends", () => {
    const schedule = generateGustSchedule("course-a", 200);
    expect(activeGust(schedule, -1)).toBeNull();
  });

  test("windAt returns only the ambient vector when no gust is active", () => {
    const ambient = createAmbientWind("course-a");
    const sample = windAt(ambient, [], 10);
    expect(sample.gust).toBeNull();
    expect(sample.vector[0]).toBeCloseTo(ambient.at(10)[0], 5);
    expect(sample.vector[1]).toBeCloseTo(ambient.at(10)[1], 5);
  });

  test("windAt adds the gust vector on top of ambient wind while a gust is active", () => {
    const ambient = createAmbientWind("course-a");
    const schedule = [{ id: "g", startSec: 5, durationSec: 3, direction: [1, 0] as const, strength: 6 }];
    const inactive = windAt(ambient, schedule, 1);
    const active = windAt(ambient, schedule, 6);
    expect(inactive.gust).toBeNull();
    expect(active.gust).not.toBeNull();
    expect(Math.hypot(active.vector[0], active.vector[1])).toBeGreaterThan(Math.hypot(inactive.vector[0], inactive.vector[1]));
  });
});

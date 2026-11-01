import { describe, expect, test } from "bun:test";
import { createSearchBeat, searchBeatStep } from "./searchBeat";

const TUNING = { reach: 0.5, arriveRadius: 1, turnMin: Math.PI / 2, turnSpread: 0 };

describe("searchBeatStep", () => {
  test("picks a bearing, heads for a waypoint inside the circle and turns on arrival", () => {
    const beat = createSearchBeat();
    const area = { center: [10, 10] as const, radius: 20 };
    const first = searchBeatStep(beat, [10, 10], area, TUNING, () => 0);
    expect(first).toEqual([10, 20]);
    expect(searchBeatStep(beat, [10, 19.5], area, TUNING, () => 0)).toBeNull();
    const next = searchBeatStep(beat, [10, 19.5], area, TUNING, () => 0);
    expect(next?.[0]).toBeCloseTo(20);
    expect(next?.[1]).toBeCloseTo(10);
  });

  test("the state is a plain number that survives a JSON round trip", () => {
    const beat = createSearchBeat();
    searchBeatStep(beat, [0, 0], { center: [0, 0], radius: 8 }, TUNING, () => 0.25);
    expect(JSON.parse(JSON.stringify(beat))).toEqual(beat);
  });
});

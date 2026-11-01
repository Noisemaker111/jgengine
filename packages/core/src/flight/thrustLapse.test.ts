import { describe, expect, test } from "bun:test";

import { lapseRatio, thrustLapse } from "./thrustLapse";

const FOOT = 0.3048;

describe("thrust lapse", () => {
  test("the F100 default lapses like the reference cycle: about half at 20 000 ft, a quarter at 40 000 ft", () => {
    expect(lapseRatio({}, 0, 0, false)).toBe(1);
    expect(lapseRatio({}, 0, 0.9, false)).toBeCloseTo(0.94, 2);
    expect(lapseRatio({}, 20000 * FOOT, 0.6, false)).toBeCloseTo(0.48, 1);
    expect(lapseRatio({}, 40000 * FOOT, 0.9, false)).toBeCloseTo(0.25, 1);
    // Reheat gains more from ram than dry thrust does.
    expect(lapseRatio({}, 0, 1, true)).toBeGreaterThan(lapseRatio({}, 0, 1, false));
  });

  test("strength 0 ignores the air, 1 reads the table, past 1 the ratio is raised to the strength", () => {
    const ratio = lapseRatio({}, 6096, 0.6, false);
    expect(thrustLapse({}, 0, 6096, 0.6, false)).toBe(1);
    expect(thrustLapse({}, 1, 6096, 0.6, false)).toBeCloseTo(ratio, 9);
    expect(thrustLapse({}, 2, 6096, 0.6, false)).toBeCloseTo(ratio * ratio, 9);
    expect(thrustLapse({ elevation: 3048 }, 1, 3048, 0.6, false)).toBeCloseTo(ratio, 9);
  });

  test("a game's own table replaces the default", () => {
    const flat = { machs: [0, 1], altitudes: [0, 10000], dry: [1, 0.5, 1, 0.5] };
    expect(lapseRatio(flat, 5000, 0.3, false)).toBeCloseTo(0.75, 9);
  });
});

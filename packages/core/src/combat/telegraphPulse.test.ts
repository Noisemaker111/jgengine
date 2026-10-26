import { describe, expect, test } from "bun:test";

import { telegraphPulseOpacity } from "./telegraphPulse";

describe("telegraphPulseOpacity", () => {
  test("pulses from 0.45 to 0.95 across the windup without React state", () => {
    expect(telegraphPulseOpacity(1000, 1000, 1000)).toBeCloseTo(0.45, 5);
    expect(telegraphPulseOpacity(1000, 1000, 1500)).toBeCloseTo(0.7, 5);
    expect(telegraphPulseOpacity(1000, 1000, 2000)).toBeCloseTo(0.95, 5);
    expect(telegraphPulseOpacity(1000, 1000, 3000)).toBeCloseTo(0.95, 5);
  });
});

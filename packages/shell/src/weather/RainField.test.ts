import { describe, expect, test } from "bun:test";

import { rainAmount } from "./RainField";
import { DEFAULT_RAIN_DENSITY } from "./weatherMath";

describe("rain field", () => {
  test("reports a steady shower at the default density, scaled by local rain and capped", () => {
    expect(rainAmount(DEFAULT_RAIN_DENSITY, 1)).toBeCloseTo(0.8, 5);
    expect(rainAmount(DEFAULT_RAIN_DENSITY, 0.5)).toBeCloseTo(0.4, 5);
    expect(rainAmount(DEFAULT_RAIN_DENSITY * 4, 1)).toBe(1);
    expect(rainAmount(0, 1)).toBe(0);
    expect(rainAmount(-1, 1)).toBe(0);
  });
});

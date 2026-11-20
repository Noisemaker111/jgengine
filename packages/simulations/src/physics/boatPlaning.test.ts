import { describe, expect, test } from "bun:test";

import { planingForces, planingTrim } from "./boatPlaning";

const DEG = Math.PI / 180;
// The 6 m speedboat's bottom: 900 kg, 2.3 m chine beam, 18° deadrise, G 38% of 6 m forward of the transom, 0.45 m up.
const bottom = { deadrise: 18 * DEG, lcg: 0.38 * 6, vcg: 0.45 };

describe("boatPlaning", () => {
  test("runs at Savitsky's trim and resistance for a 6 m speedboat (2.18° and 2.01 kN at 12 m/s)", () => {
    const trim = planingTrim(bottom, 2.3, 900, 12);
    expect(trim / DEG).toBeCloseTo(2.18, 1);
    expect(planingForces(bottom, 2.3, 900, 12, trim).resistance / 1000).toBeCloseTo(2.01, 1);
    expect(Math.abs(planingForces(bottom, 2.3, 900, 12, trim).moment)).toBeLessThan(1);
  });

  test("trim falls as speed rises, and too much trim brings a bow-down moment", () => {
    expect(planingTrim(bottom, 2.3, 900, 16)).toBeLessThan(planingTrim(bottom, 2.3, 900, 12));
    const trim = planingTrim(bottom, 2.3, 900, 12);
    expect(planingForces(bottom, 2.3, 900, 12, trim + 2 * DEG).moment).toBeGreaterThan(0);
    expect(planingForces(bottom, 2.3, 900, 12, trim - 1 * DEG).moment).toBeLessThan(0);
  });
});

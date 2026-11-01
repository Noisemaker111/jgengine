import { describe, expect, test } from "bun:test";

import { prepareOpenWater, propellerPoint, type BoatPropeller } from "./boatPropeller";

// Holtrop and Mennen's 1982 example screw: 8 m, 4 blades, A_E/A_0 0.7393, K_T 0.18802 and K_Q 0.033275 at J = 0.7185.
const advance = (25 * 0.5144444 * (1 - 0.2584)) / (1.6594 * 8);

describe("boatPropeller", () => {
  test("the B-series curve at the pitch giving the example's K_T gives its K_Q within 0.5%", () => {
    let low = 0.5;
    let high = 1.4;
    const curve = (pitchRatio: number) => prepareOpenWater({ kind: "bseries", blades: 4, areaRatio: 0.7393, pitchRatio }, 8);
    for (let i = 0; i < 80; i += 1) {
      const mid = 0.5 * (low + high);
      if (curve(mid).thrust(advance) < 0.18802) low = mid;
      else high = mid;
    }
    expect(Math.abs((curve(low).torque?.(advance) ?? 0) / 0.033275 - 1)).toBeLessThan(5e-3);
  });

  test("a power-limited engine turns the propeller slower at bollard than at speed, and never past its revs", () => {
    const propeller: BoatPropeller = { diameter: 0.36, openWater: { kind: "bseries", blades: 3, areaRatio: 0.6, pitchRatio: 1.2 }, engine: { maxRevs: 45, maxPower: 100e3 } };
    const curve = prepareOpenWater(propeller.openWater, propeller.diameter);
    const bollard = propellerPoint(propeller, curve, 0, 1, 0, 1025);
    const running = propellerPoint(propeller, curve, 14, 1, 0, 1025);
    expect(bollard.revs).toBeLessThan(running.revs);
    expect(running.revs).toBeLessThanOrEqual(45);
    expect(bollard.power).toBeCloseTo(100e3, -1);
    expect(bollard.thrust).toBeGreaterThan(running.thrust);
  });

  test("a governor holds throttle times its revs; astern is a share of the bollard pull", () => {
    const propeller: BoatPropeller = { diameter: 0.216, openWater: { kind: "polynomial", thrust: [0.2931, -0.2753, -0.1385] }, engine: { maxRevs: 10 } };
    const curve = prepareOpenWater(propeller.openWater, propeller.diameter);
    expect(propellerPoint(propeller, curve, 0.5, 0.5, 0, 1000).revs).toBeCloseTo(5, 9);
    const astern = propellerPoint(propeller, curve, 0, 0, 1, 1000);
    expect(astern.thrust).toBeCloseTo(-0.4 * 1000 * 100 * 0.216 ** 4 * 0.2931, 9);
  });
});

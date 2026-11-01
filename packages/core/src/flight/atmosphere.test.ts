import { describe, expect, test } from "bun:test";

import { atmosphereAt, SEA_LEVEL_AIR, standardAir, type AirSample } from "./atmosphere";

const air = (): AirSample => ({ density: 0, pressure: 0, temperature: 0, speedOfSound: 0 });

describe("standard atmosphere", () => {
  test("matches the U.S. Standard Atmosphere 1976 tables", () => {
    // NOAA-S/T 76-1562 Table I: 5 km, 11 km (tropopause) and 20 km geometric.
    const five = standardAir(5000);
    expect(five.temperature).toBeCloseTo(255.68, 1);
    expect(five.pressure / 54048).toBeCloseTo(1, 3);
    expect(five.density / 0.73643).toBeCloseTo(1, 3);
    const tropopause = standardAir(11000);
    expect(tropopause.temperature).toBeCloseTo(216.77, 1);
    expect(tropopause.density / 0.36480).toBeCloseTo(1, 2);
    expect(standardAir(20000).pressure / 5529.3).toBeCloseTo(1, 2);
    expect(standardAir(0).speedOfSound).toBeCloseTo(340.29, 1);
  });

  test("a hot day thins the air at the same pressure", () => {
    expect(standardAir(0, 20).density).toBeLessThan(SEA_LEVEL_AIR.density);
    expect(standardAir(0, 20).pressure).toBeCloseTo(SEA_LEVEL_AIR.pressure, 6);
  });

  test("strength 0 is sea-level air everywhere, 1 the standard, and the elevation shifts the world's origin", () => {
    expect(atmosphereAt({}, 0, 8000, air()).density).toBeCloseTo(1.225, 9);
    expect(atmosphereAt({}, 1, 8000, air()).density).toBeCloseTo(standardAir(8000).density, 9);
    expect(atmosphereAt({ elevation: 2000 }, 1, 3000, air()).density).toBeCloseTo(standardAir(5000).density, 9);
    expect(atmosphereAt({}, 2, 8000, air()).density).toBeLessThan(atmosphereAt({}, 1, 8000, air()).density);
  });
});

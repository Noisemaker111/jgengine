import { describe, expect, test } from "bun:test";

import { calibratedAirspeed, geopotentialAltitude, standardAtmosphere, standardGravity } from "./standardAtmosphere";

const geometric = (geopotential: number) => (6356766 * geopotential) / (6356766 - geopotential);

function within(actual: number, expected: number, relative: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relative);
}

describe("US Standard Atmosphere 1976", () => {
  test("sea level matches the table", () => {
    const air = standardAtmosphere(0);
    within(air.temperature, 288.15, 1e-9);
    within(air.pressure, 101325, 1e-9);
    within(air.density, 1.225, 1e-4);
    within(air.speedOfSound, 340.294, 1e-5);
    within(air.viscosity, 1.7894e-5, 1e-3);
  });

  test("layer base pressures at geopotential 11, 20, 32, 47, 51 and 71 km match the table to 1e-5", () => {
    const bases: readonly [number, number, number][] = [
      [11000, 216.65, 22632.06],
      [20000, 216.65, 5474.889],
      [32000, 228.65, 868.0187],
      [47000, 270.65, 110.9063],
      [51000, 270.65, 66.93887],
      [71000, 214.65, 3.95642],
    ];
    for (const [h, temperature, pressure] of bases) {
      const air = standardAtmosphere(geometric(h));
      expect(geopotentialAltitude(geometric(h))).toBeCloseTo(h, 6);
      within(air.temperature, temperature, 1e-9);
      within(air.pressure, pressure, 1e-5);
    }
  });

  test("densities at geopotential 11 and 20 km and the 86 km top match the published table", () => {
    within(standardAtmosphere(geometric(11000)).density, 0.36392, 1e-4);
    within(standardAtmosphere(geometric(20000)).density, 0.088035, 1e-4);
    const top = standardAtmosphere(86000);
    within(top.temperature, 186.87, 1e-3);
    within(top.pressure, 0.37338, 2e-3);
    within(top.density, 6.958e-6, 2e-3);
  });

  test("gravity falls with the square of the distance from the Earth's centre", () => {
    expect(standardGravity(0)).toBeCloseTo(9.80665, 9);
    within(standardGravity(10000), 9.80665 * (6356766 / 6366766) ** 2, 1e-12);
  });

  test("calibrated airspeed equals true airspeed at sea level and reads low at altitude", () => {
    within(calibratedAirspeed(100, standardAtmosphere(0)), 100, 1e-6);
    const high = calibratedAirspeed(200, standardAtmosphere(10000));
    expect(high).toBeLessThan(200 * Math.sqrt(standardAtmosphere(10000).density / 1.225) * 1.05);
    expect(high).toBeGreaterThan(200 * Math.sqrt(standardAtmosphere(10000).density / 1.225));
  });
});

import { describe, expect, test } from "bun:test";

import { rotatingEarthAcceleration, rotatingEarthFrame } from "./rotatingEarth";

const CAPE = { latitude: (28.6082 * Math.PI) / 180, bearing: Math.PI / 2 };

describe("rotating Earth", () => {
  test("gravity on the surface is μ/R² toward the centre, falling with the inverse square of distance", () => {
    const out: [number, number, number] = [0, 0, 0];
    rotatingEarthAcceleration({ rotationRate: 0 }, 1, [0, 0, 0], [0, 0, 0], [0, -9.81, 0], out);
    expect(out[1]).toBeCloseTo(-3.986004418e14 / 6378137 ** 2, 9);
    rotatingEarthAcceleration({ rotationRate: 0 }, 1, [0, 6378137, 0], [0, 0, 0], [0, -9.81, 0], out);
    expect(out[1]).toBeCloseTo(-3.986004418e14 / (2 * 6378137) ** 2, 9);
    // Downrange the vertical tips toward the planet's centre: gravity gains a horizontal part.
    rotatingEarthAcceleration({ rotationRate: 0 }, 1, [0, 0, 100000], [0, 0, 0], [0, -9.81, 0], out);
    expect(out[2]).toBeLessThan(-0.1);
  });

  test("Launch Complex 39A rides the spin at 408 m/s east, and the frame bends a northbound flight east", () => {
    const pad = rotatingEarthFrame(CAPE, 1, [0, 0, 0], [0, 0, 0]);
    // With +z east, east is +z.
    expect(pad.inertialVelocity[2]).toBeCloseTo(465.1 * Math.cos(CAPE.latitude), 0);
    expect(pad.altitude).toBe(0);
    const out: [number, number, number] = [0, 0, 0];
    // Northbound (world +x when +z is east) in the northern hemisphere: Coriolis pushes east (+z).
    rotatingEarthAcceleration(CAPE, 1, [0, 0, 0], [1000, 0, 0], [0, -9.81, 0], out);
    expect(out[2]).toBeCloseTo(2 * 7.292115e-5 * Math.sin(CAPE.latitude) * 1000, 9);
  });

  test("strength 0 is the flat field; the surface range follows the great circle", () => {
    const out: [number, number, number] = [0, 0, 0];
    rotatingEarthAcceleration(CAPE, 0, [0, 50000, 300000], [100, 200, 300], [0, -9.81, 0], out);
    expect(out).toEqual([0, -9.81, 0]);
    const far = rotatingEarthFrame(CAPE, 1, [0, -6378137 * (1 - Math.cos(0.01)), 6378137 * Math.sin(0.01)], [0, 0, 0]);
    expect(far.surfaceRange).toBeCloseTo(63781.37, 0);
    expect(far.altitude).toBeCloseTo(0, 3);
  });
});

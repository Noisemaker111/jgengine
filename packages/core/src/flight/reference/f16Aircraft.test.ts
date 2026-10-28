import { describe, expect, test } from "bun:test";

import { linearizeReferenceAircraft, referenceStateFromWindAxes, trimReferenceAircraft, windAxisRates } from "./aircraftTrim";
import { createF16Model, f16PowerCommand, STEVENS_LEWIS_GRAVITY, stevensLewisAtmosphere } from "./f16Aircraft";
import { createReferenceAircraft, referenceEuler } from "./referenceAircraft";

const FT = 0.3048;
const DEG = Math.PI / 180;

function bookF16(xcg = 0.35) {
  return createReferenceAircraft(createF16Model({ xcg }), { atmosphere: stevensLewisAtmosphere, gravity: () => STEVENS_LEWIS_GRAVITY, groundElevation: () => -1e5 });
}

function within(actual: number, expected: number, relative: number, absolute = 0): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(absolute, Math.abs(expected) * relative));
}

describe("F-16 reference (NASA TP-1538 via Stevens & Lewis)", () => {
  test("reproduces the Stevens & Lewis state-derivative check case to 0.1%", () => {
    // Stevens & Lewis, 2nd ed., §3.5: x = (500 ft/s, α 0.5, β −0.2, φ −1, θ 1, ψ −1, P 0.7, Q −0.8, R 0.9,
    // 1000 ft N, 900 ft E, 10 000 ft, power 90), u = (throttle 0.9, elevator 20°, aileron −15°, rudder −20°), xcg 0.4.
    const aircraft = bookF16(0.4);
    const state = referenceStateFromWindAxes(
      { airspeed: 500 * FT, alpha: 0.5, beta: -0.2, bank: -1, pitch: 1, heading: -1, p: 0.7, q: -0.8, r: 0.9, north: 1000 * FT, east: 900 * FT, altitude: 10000 * FT },
      { elevator: 20 * DEG, aileron: -15 * DEG, rudder: -20 * DEG, flap: 0 },
      [90],
    );
    const input = { throttle: 0.9, pitch: 0, roll: 0, yaw: 0 };
    const rates = windAxisRates(aircraft, state, input);
    const raw = aircraft.derivative(state, input);
    within(rates.airspeed / FT, -75.23724, 1e-3);
    within(rates.alpha, -0.8813491, 1e-3);
    within(rates.beta, -0.475999, 1e-3);
    within(rates.p, 12.62679, 1e-3);
    within(rates.q, 0.9649671, 1e-3);
    within(rates.r, 0.5809759, 1e-3);
    within(rates.north / FT, 342.4439, 1e-4);
    within(rates.east / FT, -266.7707, 1e-4);
    within(rates.altitude / FT, 248.1241, 1e-4);
    within(raw.propulsion[0] ?? 0, -58.68999, 1e-3);
    // Euler rates through the quaternion path, against the book's φ̇ θ̇ ψ̇.
    const eps = 1e-6;
    const nudged = (sign: number): [number, number, number, number] => {
      const [w, x, y, z] = state.attitude;
      const [dw, dx, dy, dz] = raw.attitude;
      return [w + sign * eps * dw, x + sign * eps * dx, y + sign * eps * dy, z + sign * eps * dz];
    };
    const ahead = referenceEuler(nudged(1));
    const behind = referenceEuler(nudged(-1));
    within((ahead.bank - behind.bank) / (2 * eps), 2.505734, 1e-4);
    within((ahead.pitch - behind.pitch) / (2 * eps), 0.325082, 1e-4);
    within((ahead.heading - behind.heading) / (2 * eps), 2.145926, 1e-4);
  });

  test("throttle gearing puts military power at 77% throttle", () => {
    expect(f16PowerCommand(0.77)).toBeCloseTo(50, 1);
    expect(f16PowerCommand(1)).toBeCloseTo(100, 6);
  });
});

describe("F-16 trim and modes", () => {
  test("trims level at 502 ft/s, sea level, xcg 0.35 to the Stevens & Lewis table", () => {
    // Stevens & Lewis, 2nd ed., Table 3.6-3: throttle 0.1385, elevator −0.7588°, α 2.1215°.
    const trim = trimReferenceAircraft(bookF16(0.35), { airspeed: 502 * FT, altitude: 0 });
    expect(trim.converged).toBe(true);
    within(trim.throttle, 0.1385, 2e-3);
    within(trim.surfaces.elevator / DEG, -0.7588, 2e-3);
    within(trim.alpha / DEG, 2.1215, 2e-3);
  });

  test("trims level at 500 ft/s, 10 000 ft, xcg 0.35 to the published solution", () => {
    // Throttle 0.1678, elevator −0.6531°, α 0.0594 rad (Stevens & Lewis F-16 trim as reproduced in the Archimedes tutorial).
    const trim = trimReferenceAircraft(bookF16(0.35), { airspeed: 500 * FT, altitude: 10000 * FT });
    expect(trim.converged).toBe(true);
    within(trim.throttle, 0.1678, 3e-3);
    within(trim.surfaces.elevator / DEG, -0.6531, 3e-3);
    within(trim.alpha, 0.0594, 5e-3);
  });

  test("linear modes at 502 ft/s, sea level, xcg 0.30 match the published eigenvalues within 1.5%", () => {
    const aircraft = bookF16(0.3);
    const lin = linearizeReferenceAircraft(aircraft, trimReferenceAircraft(aircraft, { airspeed: 502 * FT, altitude: 0 }));
    const published: Record<string, [number, number]> = {
      "short period": [-1.2038, 1.492],
      phugoid: [-0.0087, 0.074],
      "dutch roll": [-0.4362, 3.219],
      "roll subsidence": [-3.6003, 0],
      spiral: [-0.0128, 0],
    };
    for (const [name, [real, imag]] of Object.entries(published)) {
      const mode = lin.modes.find((candidate) => candidate.name === name);
      expect(mode).toBeDefined();
      within(mode?.eigenvalue.re ?? 0, real, 0.015, 2e-4);
      within(Math.abs(mode?.eigenvalue.im ?? 0), imag, 0.015, 2e-4);
    }
  });

  test("at xcg 0.35 the bare airframe is statically unstable in pitch", () => {
    const aircraft = bookF16(0.35);
    const lin = linearizeReferenceAircraft(aircraft, trimReferenceAircraft(aircraft, { airspeed: 502 * FT, altitude: 0 }));
    expect(Math.max(...lin.longitudinalEigenvalues.map((value) => value.re))).toBeGreaterThan(0.05);
  });
});

describe("F-16 integration", () => {
  // Small steady inputs keep the actuators off their rate limits and α inside one table cell, where RK4 is fourth order.
  function flyDoublet(step: number) {
    const aircraft = createReferenceAircraft(createF16Model({ xcg: 0.3 }), { step, groundElevation: () => -1e5 });
    const trim = trimReferenceAircraft(aircraft, { airspeed: 150, altitude: 3000 });
    aircraft.restore(trim.state);
    const base = { throttle: trim.throttle, pitch: 0, roll: 0, yaw: 0 };
    const ticks = Math.round(2 / step);
    for (let i = 0; i < ticks; i += 1) {
      aircraft.step(step, { ...base, pitch: 0.05, roll: 0.05 });
    }
    return aircraft.snapshot();
  }

  test("RK4 converges at fourth order: halving the step cuts the error about sixteen-fold", () => {
    const coarse = flyDoublet(1 / 50);
    const medium = flyDoublet(1 / 100);
    const fine = flyDoublet(1 / 200);
    const gap = (a: typeof coarse, b: typeof coarse) => Math.hypot(...a.position.map((value, i) => value - (b.position[i] ?? 0)), ...a.attitude.map((value, i) => 100 * (value - (b.attitude[i] ?? 0))));
    const ratio = gap(coarse, medium) / gap(medium, fine);
    expect(ratio).toBeGreaterThan(10);
    expect(ratio).toBeLessThan(24);
    expect(gap(medium, fine)).toBeLessThan(1e-4);
  });

  test("the attitude quaternion stays unit length through a long rolling flight", () => {
    const aircraft = createReferenceAircraft(createF16Model({ xcg: 0.3 }), { groundElevation: () => -1e5 });
    aircraft.reset({ altitude: 5000, airspeed: 200, throttle: 0.6 });
    for (let i = 0; i < 3000; i += 1) aircraft.step(0.01, { throttle: 0.6, pitch: 0.1, roll: 0.5, yaw: 0 });
    const [w, x, y, z] = aircraft.snapshot().attitude;
    expect(Math.abs(Math.hypot(w, x, y, z) - 1)).toBeLessThan(1e-9);
  });
});

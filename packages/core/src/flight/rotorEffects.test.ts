import { describe, expect, test } from "bun:test";

import { autorotationRates, settledGovernor, type AutorotationRates } from "./autorotation";
import { rotorInflowLoads, type RotorInflowLoads } from "./rotorInflow";

const RADIUS = 16.11 * 0.3048;
const WEIGHT = 2200 * 9.80665;
const loads = (): RotorInflowLoads => ({ thrust: 0, torque: 0, inflow: 0.05, groundEffect: 1 });
const thrust = (lever: number, climb = 0, edgewise = 0, height = Number.POSITIVE_INFINITY, strength = 1) =>
  rotorInflowLoads({}, strength, RADIUS, lever, 1, climb, edgewise, 1.225, height, 0.05, loads()).thrust;

function hoverLever(): number {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 50; i += 1) {
    const middle = 0.5 * (low + high);
    if (thrust(middle) < WEIGHT) low = middle;
    else high = middle;
  }
  return low;
}

describe("rotor inflow", () => {
  const lever = hoverLever();
  const vh = Math.sqrt(WEIGHT / (2 * 1.225 * Math.PI * RADIUS * RADIUS));

  test("the Bo-105 hovers at about 7° collective with the blade-element reference's torque", () => {
    expect(lever * 16).toBeCloseTo(7.3, 0);
    const hover = rotorInflowLoads({}, 1, RADIUS, lever, 1, 0, 0, 1.225, Number.POSITIVE_INFINITY, 0.05, loads());
    // Reference: 6.83%; NASA TM-110356: 7.56%.
    expect((100 * hover.torque) / (hover.thrust * RADIUS)).toBeGreaterThan(6.3);
    expect((100 * hover.torque) / (hover.thrust * RADIUS)).toBeLessThan(7.9);
  });

  test("thrust at fixed collective falls climbing, rises descending, edgewise and near the ground, as the reference rotor does", () => {
    const hover = thrust(lever);
    expect(thrust(lever, vh) / hover).toBeCloseTo(0.55, 1);
    expect(thrust(lever, -vh) / hover).toBeCloseTo(1.23, 1);
    expect(thrust(lever, 0, 2 * vh) / hover).toBeCloseTo(1.41, 1);
    expect(thrust(lever, 0, 0, RADIUS / 2) / hover).toBeCloseTo(1.21, 1);
  });

  test("a stopped rotor makes nothing and stays finite", () => {
    const stopped = rotorInflowLoads({}, 1, RADIUS, 0.5, 0, -40, 30, 1.225, 10, 0.05, loads());
    expect(stopped.thrust).toBe(0);
    expect(Number.isFinite(stopped.inflow)).toBe(true);
  });
});

describe("autorotation", () => {
  const out = (): AutorotationRates => ({ speedRate: 0, governorRate: 0, engineTorque: 0 });

  test("the governor holds rated speed against a steady load", () => {
    const load = 7000;
    const rates = autorotationRates({}, 1, 1, settledGovernor({}, 1, load), 1, load, 1, out());
    expect(rates.speedRate).toBeCloseTo(0, 6);
    expect(rates.engineTorque).toBeCloseTo(load * 1.08, 3);
  });

  test("with the engine off the rotor slows on its inertia alone, more slowly past strength 1", () => {
    const off = autorotationRates({}, 1, 1, 0, 0, 7000, 1, out());
    expect(off.engineTorque).toBe(0);
    expect(off.speedRate).toBeCloseTo(-(7000 * 1.08) / 926.8 / 44.5, 9);
    expect(autorotationRates({}, 2, 1, 0, 0, 7000, 1, out()).speedRate).toBeCloseTo(off.speedRate / 2, 9);
  });

  test("engine power lapses with density", () => {
    const thin = autorotationRates({}, 1, 0.5, 5, 1, 0, 0.5, out());
    const thick = autorotationRates({}, 1, 0.5, 5, 1, 0, 1, out());
    expect(thin.engineTorque).toBeCloseTo(thick.engineTorque / 2, 6);
  });
});

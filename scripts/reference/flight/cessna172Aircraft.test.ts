import { beforeAll, describe, expect, test } from "bun:test";

import { trimReferenceAircraft } from "./aircraftTrim";
import { C172_PROPELLER, createCessna172Model } from "./cessna172Aircraft";
import { CESSNA_172N_PUBLISHED, formatFlightComparison } from "./flightComparison";
import { referenceFlightSubject, runFlightTests, type FlightTestReport } from "./flightTests";
import { solvePropeller } from "./propeller";
import { createReferenceAircraft, type ReferencePilotInput } from "./referenceAircraft";

const KNOT = 0.514444;
const FOOT = 0.3048;
const HP = 745.7;

function within(actual: number, expected: number, relative: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relative);
}

function published(metric: keyof FlightTestReport): number {
  const value = CESSNA_172N_PUBLISHED[metric];
  if (value === undefined) throw new Error(`no published ${metric}`);
  return value;
}

describe("Cessna 172 reference against the 172N handbook", () => {
  let report: FlightTestReport;
  beforeAll(() => {
    report = runFlightTests(referenceFlightSubject(createCessna172Model(), 55));
  });

  // Tolerances: stall ±8%, top speed ±6%, climb ±15%, take-off roll ±25% (the handbook chart is flaps 10°, the
  // test is flaps up). The cruise power point and static rpm are calibration inputs, checked below, not predictions.
  test("stalls within 8% of 50 KCAS", () => within(report.stallSpeed, published("stallSpeed"), 0.08));
  test("tops out within 6% of 125 KTAS", () => within(report.maxLevelSpeed, published("maxLevelSpeed"), 0.06));
  test("climbs within 15% of 770 ft/min", () => within(report.maxClimbRate, published("maxClimbRate"), 0.15));
  test("lifts off within 25% of the 805 ft ground roll", () => within(report.takeoffGroundRoll, published("takeoffGroundRoll"), 0.25));
  test("rolls and turns like a light trainer", () => {
    expect(report.rollRate).toBeGreaterThan(40);
    expect(report.rollRate).toBeLessThan(100);
    expect(report.sustainedTurnRate).toBeGreaterThan(12);
    expect(report.sustainedTurnRate).toBeLessThan(30);
  });
  test("formats a comparison table", () => {
    const text = formatFlightComparison([
      {
        aircraft: "Test plane",
        reference: "Cessna 172N",
        rows: [{ label: "stall speed", unit: "m/s EAS", game: 20, reference: report.stallSpeed, real: published("stallSpeed") }],
      },
    ]);
    expect(text).toContain("Test plane vs Cessna 172N");
    expect(text).toMatch(/stall speed\s+m\/s EAS\s+20\.0\s+25\.\d\s+25\.7\s+-2\d%\s+[+-]\d+%/);
  });
});

describe("Cessna 172 calibration points", () => {
  test("75% power holds 122 KTAS at 8000 ft near 2700 rpm (calibrated drag and propeller)", () => {
    const aircraft = createReferenceAircraft(createCessna172Model(), { groundElevation: () => -1e4 });
    const trim = trimReferenceAircraft(aircraft, { airspeed: 122 * KNOT, altitude: 8000 * FOOT });
    expect(trim.converged).toBe(true);
    const sample = aircraft.sampleOf(trim.state, { throttle: trim.throttle, pitch: 0, roll: 0, yaw: 0 });
    within(sample.shaftPower, 0.75 * 160 * HP, 0.03);
    within(sample.rpm, 2700, 0.05);
  });

  test("full throttle on the brakes turns the propeller 2280–2400 rpm (calibrated chord)", () => {
    const aircraft = createReferenceAircraft(createCessna172Model());
    aircraft.restOnGround();
    let sample = aircraft.sample();
    for (let i = 0; i < 300; i += 1) sample = aircraft.step(0.01, { throttle: 1, pitch: 0, roll: 0, yaw: 0, brake: 1 });
    expect(sample.rpm).toBeGreaterThan(2280);
    expect(sample.rpm).toBeLessThan(2400);
  });

  test("blade-element propeller peaks near 80–88% efficiency and unloads at high advance ratio", () => {
    let best = 0;
    for (let j = 0.1; j < 1; j += 0.05) {
      const { ct, cp } = solvePropeller(C172_PROPELLER, j, 0.7);
      if (ct > 0) best = Math.max(best, (j * ct) / cp);
    }
    expect(best).toBeGreaterThan(0.8);
    expect(best).toBeLessThan(0.88);
    expect(solvePropeller(C172_PROPELLER, 0, 0.7).ct).toBeGreaterThan(0.08);
    expect(solvePropeller(C172_PROPELLER, 1.1, 0.7).ct).toBeLessThan(0);
  });
});

describe("ground handling", () => {
  const parked: ReferencePilotInput = { throttle: 0, pitch: 0, roll: 0, yaw: 0, brake: 1 };

  test("rests on its struts carrying its weight, brakes holding", () => {
    const model = createCessna172Model();
    const aircraft = createReferenceAircraft(model);
    aircraft.restOnGround();
    let sample = aircraft.sample();
    for (let i = 0; i < 200; i += 1) sample = aircraft.step(0.01, parked);
    expect(sample.onGround).toBe(true);
    expect(Math.hypot(...sample.groundVelocity)).toBeLessThan(0.01);
    expect(sample.gearLoads.every((load) => load > 0)).toBe(true);
    within(
      sample.gearLoads.reduce((sum, load) => sum + load, 0),
      model.mass.massKg * 9.80665,
      0.02,
    );
  });

  test("brakes stop a taxiing aircraft far sooner than rolling friction", () => {
    const rollOut = (brake: number): number => {
      const aircraft = createReferenceAircraft(createCessna172Model());
      aircraft.restOnGround();
      let sample = aircraft.sample();
      while (sample.groundVelocity[0] < 12) sample = aircraft.step(0.01, { throttle: 1, pitch: 0, roll: 0, yaw: 0 });
      const start = sample.position[0];
      for (let i = 0; i < 6000 && sample.groundVelocity[0] > 0.2; i += 1) sample = aircraft.step(0.01, { throttle: 0, pitch: 0, roll: 0, yaw: 0, brake });
      return sample.position[0] - start;
    };
    expect(rollOut(1) * 3).toBeLessThan(rollOut(0));
  });

  test("pedals steer the nosewheel", () => {
    const aircraft = createReferenceAircraft(createCessna172Model());
    aircraft.restOnGround();
    let sample = aircraft.sample();
    for (let i = 0; i < 1500; i += 1) sample = aircraft.step(0.01, { throttle: 0.35, pitch: 0, roll: 0, yaw: 1 });
    expect(sample.onGround).toBe(true);
    expect(sample.heading).toBeGreaterThan(0.5);
  });
});

describe("wind", () => {
  test("a uniform wind carries the aircraft without changing its flight through the air", () => {
    const still = createReferenceAircraft(createCessna172Model(), { groundElevation: () => -1e4 });
    const windy = createReferenceAircraft(createCessna172Model(), { groundElevation: () => -1e4, wind: () => [0, 10, 0] });
    const trim = trimReferenceAircraft(still, { airspeed: 50, altitude: 1000 });
    still.restore(trim.state);
    const [u, v, w] = trim.state.velocity;
    // Heading north with wings level the body's right axis is east, so the wind adds straight to v.
    windy.restore({ ...trim.state, velocity: [u, v + 10, w] });
    const input = { throttle: trim.throttle, pitch: 0.1, roll: 0.1, yaw: 0 };
    let a = still.sample();
    let b = windy.sample();
    for (let i = 0; i < 1000; i += 1) {
      a = still.step(0.01, input);
      b = windy.step(0.01, input);
    }
    expect(b.airspeed).toBeCloseTo(a.airspeed, 6);
    expect(b.alpha).toBeCloseTo(a.alpha, 6);
    expect(b.bank).toBeCloseTo(a.bank, 6);
    expect(b.position[1] - a.position[1]).toBeCloseTo(100, 3);
  });
});

import { describe, expect, test } from "bun:test";

import {
  aircraftAttitudeQuaternion,
  createRigidAircraft,
  type RigidAircraft,
  type RigidAircraftInput,
  type RigidAircraftOptions,
  type RigidAircraftStep,
  type RigidAircraftTuning,
} from "./aircraftDynamics";

const DT = 1 / 60;
const DEG = 180 / Math.PI;

// A light jet trimmed for ~180 m/s: wing incidence carries the weight at that speed with the tail unloaded.
const jet: RigidAircraftTuning = {
  massKg: 9000,
  inertia: { pitch: 60000, yaw: 70000, roll: 15000 },
  surfaces: [
    { at: [2.5, 0, 0], area: 14, liftSlope: 4.5, stallAngle: 0.3, incidence: 0.035, control: { roll: 0.15 } },
    { at: [-2.5, 0, 0], area: 14, liftSlope: 4.5, stallAngle: 0.3, incidence: 0.035, control: { roll: 0.15 } },
    { at: [0, 0, -6], area: 6, liftSlope: 4, control: { pitch: 0.6 } },
    { at: [0, 1, -6], normal: [1, 0, 0], area: 4, liftSlope: 4, control: { yaw: 0.5 } },
  ],
  engine: { maxThrust: 80000, spoolRate: 1.5 },
  dragArea: 1,
  gear: { height: 1.5 },
};

function input(partial: Partial<RigidAircraftInput>): RigidAircraftInput {
  return { throttle: 0.4, pitch: 0, roll: 0, yaw: 0, ...partial };
}

function airborne(tuning: RigidAircraftTuning = jet, speed = 180, extra: RigidAircraftOptions = {}): RigidAircraft {
  return createRigidAircraft(tuning, { position: [0, 2000, 0], velocity: [0, 0, speed], ...extra });
}

function fly(aircraft: RigidAircraft, seconds: number, control: RigidAircraftInput, each?: (step: RigidAircraftStep) => void): RigidAircraftStep {
  let step = aircraft.tick(DT, control);
  each?.(step);
  for (let i = 1; i < Math.round(seconds / DT); i += 1) {
    step = aircraft.tick(DT, control);
    each?.(step);
  }
  return step;
}

describe("createRigidAircraft", () => {
  test("a trimmed jet holds level flight hands-off at about 1 g", () => {
    const step = fly(airborne(), 10, input({}));
    expect(Math.abs(step.pitch * DEG)).toBeLessThan(2);
    expect(Math.abs(step.bank * DEG)).toBeLessThan(0.5);
    expect(step.gLoad).toBeGreaterThan(0.9);
    expect(step.gLoad).toBeLessThan(1.1);
    expect(step.stalled).toBe(false);
  });

  test("held back-stick loops the jet: pitch turns past 360° and it comes out where it went in", () => {
    let pitched = 0;
    let peakG = 0;
    let wentInverted = false;
    const step = fly(airborne(jet, 200), 20, input({ throttle: 1, pitch: 1 }), (s) => {
      pitched += s.pitchRate * DT;
      peakG = Math.max(peakG, s.gLoad);
      if (Math.abs(s.bank) > Math.PI / 2) wentInverted = true;
    });
    expect(pitched * DEG).toBeGreaterThan(360);
    expect(wentInverted).toBe(true);
    expect(peakG).toBeGreaterThan(5);
    expect(step.position[1]).toBeGreaterThan(1800);
    expect(step.stalled).toBe(false);
  });

  test("full aileron rolls it through 360° with a roll rate set by the surfaces, not a commanded rate", () => {
    let rolled = 0;
    let peak = 0;
    fly(airborne(), 3, input({ roll: 1 }), (s) => {
      rolled += s.rollRate * DT;
      peak = Math.max(peak, s.rollRate * DEG);
    });
    expect(rolled * DEG).toBeGreaterThan(360);
    expect(peak).toBeGreaterThan(150);
    expect(peak).toBeLessThan(300);
  });

  test("positive inputs mean nose up, right roll and nose right", () => {
    expect(fly(airborne(), 0.5, input({ pitch: 1 })).pitchRate).toBeGreaterThan(0);
    const rolled = fly(airborne(), 0.5, input({ roll: 1 }));
    expect(rolled.rollRate).toBeGreaterThan(0);
    expect(rolled.bank).toBeGreaterThan(0);
    expect(fly(airborne(), 0.5, input({ yaw: 1 })).yawRate).toBeGreaterThan(0);
  });

  test("a slow jet with a strong elevator stalls; a weaker tail can't pull as much angle of attack", () => {
    const strongTail: RigidAircraftTuning = { ...jet, surfaces: jet.surfaces.map((s, i) => (i === 2 ? { ...s, control: { pitch: 1.5 } } : s)) };
    let stalled = false;
    let peakAlpha = 0;
    fly(airborne(strongTail, 70), 8, input({ throttle: 0, pitch: 1 }), (s) => {
      stalled ||= s.stalled;
      peakAlpha = Math.max(peakAlpha, s.angleOfAttack);
    });
    expect(stalled).toBe(true);
    expect(peakAlpha).toBeGreaterThan(0.3);

    let stockAlpha = 0;
    fly(airborne(jet, 70), 8, input({ throttle: 0, pitch: 1 }), (s) => {
      stockAlpha = Math.max(stockAlpha, s.angleOfAttack);
    });
    expect(stockAlpha).toBeLessThan(peakAlpha * 0.8);
  });

  test("the fin weathervanes the nose into a sideslip", () => {
    const aircraft = airborne(jet, 180, { velocity: [20, 0, 180] });
    const first = aircraft.tick(DT, input({}));
    const later = fly(aircraft, 3, input({}));
    expect(Math.abs(first.sideslip)).toBeGreaterThan(0.08);
    expect(Math.abs(later.sideslip)).toBeLessThan(Math.abs(first.sideslip) * 0.3);
  });

  test("the result does not depend on the frame rate", () => {
    const at = (dt: number) => {
      const aircraft = airborne();
      for (let i = 0; i < Math.round(4 / dt); i += 1) aircraft.tick(dt, input({ pitch: 0.6, roll: 0.3, throttle: 1 }));
      return aircraft.pose().position;
    };
    const coarse = at(1 / 30);
    const fine = at(1 / 120);
    for (let i = 0; i < 3; i += 1) expect(Math.abs(coarse[i]! - fine[i]!)).toBeLessThan(0.05);
  });

  test("snapshot and restore replay bit-for-bit", () => {
    const aircraft = airborne();
    fly(aircraft, 2, input({ pitch: 0.4, roll: -0.5 }));
    const saved = aircraft.snapshot();
    const a = fly(aircraft, 2, input({ pitch: 1, yaw: 0.3, throttle: 1 }));
    aircraft.restore(saved);
    const b = fly(aircraft, 2, input({ pitch: 1, yaw: 0.3, throttle: 1 }));
    expect(b.position).toEqual(a.position);
    expect(b.orientation).toEqual(a.orientation);
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });

  test("retune swaps the airframe without losing pose or momentum", () => {
    const aircraft = airborne();
    fly(aircraft, 1, input({}));
    const before = aircraft.snapshot();
    aircraft.retune({ ...jet, massKg: jet.massKg * 1.6 });
    expect(aircraft.snapshot()).toEqual(before);
    expect(aircraft.tuning().massKg).toBe(jet.massKg * 1.6);
    const heavy = fly(aircraft, 5, input({}));
    const light = fly(airborne(), 6, input({}));
    expect(heavy.position[1]).toBeLessThan(light.position[1] - 20);
  });

  test("it rests on its gear, rolls out, rotates and lifts off", () => {
    const aircraft = createRigidAircraft(jet, { position: [0, 1.5, 0] });
    const parked = fly(aircraft, 2, input({ throttle: 0 }));
    expect(parked.grounded).toBe(true);
    expect(parked.position[1]).toBeCloseTo(1.5, 5);
    let liftedAt = Number.POSITIVE_INFINITY;
    let t = 0;
    fly(aircraft, 40, input({ throttle: 1, pitch: 0.4 }), (s) => {
      t += DT;
      if (!s.grounded && s.position[1] > 20 && liftedAt === Number.POSITIVE_INFINITY) liftedAt = t;
    });
    expect(liftedAt).toBeLessThan(40);
  });

  test("airspeed and telemetry are relative to the wind", () => {
    const aircraft = airborne(jet, 180, { wind: () => [0, 0, -20] });
    expect(aircraft.tick(DT, input({})).airspeed).toBeCloseTo(200, 0);
  });

  test("modifiers scale thrust per tick", () => {
    const boosted = fly(airborne(), 3, input({ throttle: 1 }), undefined);
    const aircraft = airborne();
    let step = aircraft.tick(DT, input({ throttle: 1 }), { thrustScale: 0 });
    for (let i = 1; i < 180; i += 1) step = aircraft.tick(DT, input({ throttle: 1 }), { thrustScale: 0 });
    expect(step.thrust).toBe(0);
    expect(boosted.airspeed).toBeGreaterThan(step.airspeed + 5);
  });

  test("the attitude quaternion round-trips through heading, pitch and bank", () => {
    const aircraft = createRigidAircraft(jet, { position: [0, 500, 0], orientation: aircraftAttitudeQuaternion(1.1, 0.4, -0.7) });
    const step = aircraft.tick(0, input({}));
    expect(step.heading).toBeCloseTo(1.1, 9);
    expect(step.pitch).toBeCloseTo(0.4, 9);
    expect(step.bank).toBeCloseTo(-0.7, 9);
  });
});

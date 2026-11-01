import { describe, expect, test } from "bun:test";

import { createRigidAircraft, type RigidAircraftInput, type RigidAircraftTuning } from "./aircraftDynamics";
import type { AircraftEffects } from "./aircraftEffects";
import { aircraftFromReference, type AircraftOverrides, type AircraftReferenceId } from "./aircraftReferences";
import { inducedDragFactor } from "./wingGroundEffect";

const STRENGTHS = [0, 0.2, 1, 2, 4];
const DT = 1 / 60;
const EFFECT_KEYS: readonly (keyof AircraftEffects)[] = [
  "atmosphere",
  "thrustLapse",
  "spool",
  "afterburner",
  "propeller",
  "polar",
  "derivatives",
  "mainGear",
  "wingGroundEffect",
  "machDrag",
  "rotorInflow",
  "autorotation",
  "nozzle",
  "rotatingEarth",
];

function at(id: AircraftReferenceId, effects: AircraftOverrides["effects"]): RigidAircraftTuning {
  return aircraftFromReference(id, effects === undefined ? {} : { effects });
}

function dialed(id: AircraftReferenceId, effect: keyof AircraftEffects, strength: number, extra: AircraftOverrides["effects"] = {}): RigidAircraftTuning {
  return at(id, { ...extra, [effect]: { strength } });
}

function everyEffectAt(id: AircraftReferenceId, strength: number): RigidAircraftTuning {
  const tuning = aircraftFromReference(id);
  const effects: AircraftOverrides["effects"] = {};
  for (const key of EFFECT_KEYS) if (tuning.effects?.[key] !== undefined) Object.assign(effects, { [key]: { strength } });
  return aircraftFromReference(id, { effects });
}

function monotone(values: readonly number[], direction: 1 | -1): void {
  for (const value of values) expect(Number.isFinite(value)).toBe(true);
  for (let i = 1; i < values.length; i += 1) expect(((values[i] ?? 0) - (values[i - 1] ?? 0)) * direction).toBeGreaterThan(0);
}

function level(throttle: number, roll = 0): RigidAircraftInput {
  return { throttle, pitch: 0, roll, yaw: 0 };
}

function airborne(tuning: RigidAircraftTuning, speed: number, height = 1000) {
  return createRigidAircraft(tuning, { position: [0, height, 0], velocity: [0, 0, speed], groundHeight: () => -1e4 });
}

function peakRollRate(tuning: RigidAircraftTuning, speed: number): number {
  const aircraft = airborne(tuning, speed);
  let peak = 0;
  for (let i = 0; i < 180; i += 1) peak = Math.max(peak, Math.abs(aircraft.tick(DT, level(0.5, 1)).rollRate));
  return peak;
}

function dragDeceleration(tuning: RigidAircraftTuning, speed: number): number {
  return (speed - airborne(tuning, speed).tick(1 / 240, level(0)).velocity[2]) * 240;
}

function settledThrust(tuning: RigidAircraftTuning, speed: number, height: number, throttle: number, afterburner = 0): number {
  const aircraft = airborne(tuning, speed, height);
  aircraft.restore({ ...aircraft.snapshot(), spool: 1, afterburner });
  let thrust = 0;
  for (let i = 0; i < 60; i += 1) thrust = aircraft.tick(DT, level(throttle)).thrust;
  return thrust;
}

function spoolTime(tuning: RigidAircraftTuning): number {
  const aircraft = createRigidAircraft(tuning, { position: [0, tuning.gear?.height ?? 0, 0] });
  const idle = aircraft.tick(1e-3, { ...level(0), brake: 1 }).thrust;
  const full = settledThrust(tuning, 0, tuning.gear?.height ?? 0, 1);
  for (let i = 1; i < 60 * 120; i += 1) if (aircraft.tick(DT, { ...level(1), brake: 1 }).thrust - idle >= 0.9 * (full - idle)) return i * DT;
  return Number.POSITIVE_INFINITY;
}

function takeoffRoll(tuning: RigidAircraftTuning): number {
  const height = tuning.gear?.height ?? 0;
  const aircraft = createRigidAircraft(tuning, { position: [0, height, 0] });
  let airspeed = 0;
  for (let i = 0; i < 60 * 90; i += 1) {
    const step = aircraft.tick(DT, { throttle: 1, pitch: airspeed > 60 ? 1 : 0, roll: 0, yaw: 0 });
    airspeed = step.airspeed;
    if (!step.grounded && step.position[1] > height + 1) return step.position[2];
  }
  return Number.NaN;
}

/** A gravity turn: vertical to 12 s, a 1.55° kick over 10 s toward −z, then the nose follows the velocity. */
function ascent(tuning: RigidAircraftTuning, until = 400): { airspeed: number; inertial: number } {
  const half = Math.SQRT1_2;
  const rocket = createRigidAircraft(tuning, { orientation: [-half, 0, 0, half] });
  let input = 0;
  let result = { airspeed: 0, inertial: 0 };
  for (let time = 0.3; time < until; time += 0.1) {
    const step = rocket.tick(0.1, { throttle: 1, pitch: input, roll: 0, yaw: 0 });
    if (step.motor?.burnedOut === true) break;
    const up = step.planet?.up ?? [0, 1, 0];
    const [qx, qy, qz, qw] = step.orientation;
    const nose = [2 * (qx * qz + qw * qy), 2 * (qy * qz - qw * qx), 1 - 2 * (qx * qx + qy * qy)];
    const dot = (a: readonly number[], b: readonly number[]) => (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
    const along = -(up[2] ?? 0);
    const downrange = [-(up[0] ?? 0) * along, -(up[1] ?? 0) * along, -1 - (up[2] ?? 0) * along];
    const tilt = Math.atan2(dot(nose, downrange), dot(nose, up));
    const now = time + 0.1;
    const target = now < 12 ? 0 : now < 22 ? (1.55 * Math.PI) / 180 * ((now - 12) / 10) : Math.atan2(dot(step.velocity, downrange), dot(step.velocity, up));
    input = Math.max(-1, Math.min(1, 8 * (target - tilt) - 4 * step.pitchRate));
    result = { airspeed: Math.hypot(...step.velocity), inertial: Math.hypot(...(step.planet?.inertialVelocity ?? step.velocity)) };
  }
  return result;
}

function edgewiseRatio(tuning: RigidAircraftTuning): number {
  const rotor = tuning.rotor;
  if (rotor === undefined) return Number.NaN;
  const thrust = (velocity: readonly [number, number, number]) => {
    const aircraft = createRigidAircraft(tuning, { position: [0, 0, 0], velocity, groundHeight: () => -1e4 });
    aircraft.restore({ ...aircraft.snapshot(), rotorSpeed: 1 });
    return aircraft.tick(1e-3, { throttle: 1, pitch: 0, roll: 0, yaw: 0, collective: 0.45 }).rotor?.thrust ?? Number.NaN;
  };
  return thrust([0, 0, 20]) / thrust([0, 0, 0]);
}

function rotorSpeedAfterCut(tuning: RigidAircraftTuning): number {
  const aircraft = createRigidAircraft(tuning, { position: [0, 1000, 0], velocity: [0, 0, 35], groundHeight: () => -1e4 });
  aircraft.restore({ ...aircraft.snapshot(), rotorSpeed: 1 });
  let step = aircraft.tick(0, { throttle: 0, pitch: 0, roll: 0, yaw: 0 });
  for (let time = 0; time < 5; time += 0.02) {
    step = aircraft.tick(0.02, {
      throttle: 0,
      pitch: Math.max(-1, Math.min(1, -2.5 * step.pitch - 0.8 * step.pitchRate)),
      roll: Math.max(-1, Math.min(1, -2.5 * step.bank - 0.5 * step.rollRate)),
      yaw: Math.max(-1, Math.min(1, -2 * step.yawRate)),
      collective: time < 1 ? 0.31 : 0.1,
    });
  }
  return step.rotor?.speed ?? Number.NaN;
}

describe("effect strength: each dial is finite and monotone on the metric it governs, 0 to 4", () => {
  test("atmosphere: air at 5 km thins as the strength rises", () => {
    monotone(STRENGTHS.map((s) => airborne(dialed("f-16", "atmosphere", s), 100, 5000).tick(1e-3, level(0)).airDensity), -1);
  });
  test("thrust lapse: dry thrust at 6 km falls as the strength rises", () => {
    monotone(STRENGTHS.map((s) => settledThrust(dialed("f-16", "thrustLapse", s, { afterburner: { strength: 0 } }), 180, 6000, 1)), -1);
  });
  test("spool: idle to 90% of dry thrust takes longer as the strength rises", () => {
    monotone(STRENGTHS.map((s) => spoolTime(dialed("f-16", "spool", s, { afterburner: { strength: 0 } }))), 1);
  });
  test("afterburner: full-throttle thrust grows with the strength", () => {
    monotone(STRENGTHS.map((s) => settledThrust(dialed("f-16", "afterburner", s), 0, 0, 1, 1)), 1);
  });
  test("propeller: thrust at 50 m/s falls further below static thrust as the strength rises", () => {
    monotone(STRENGTHS.map((s) => settledThrust(dialed("cessna-172", "propeller", s), 50, 1000, 1)), -1);
  });
  test("polar: drag at cruise rises with the strength (Cessna 172 and F-16)", () => {
    monotone(STRENGTHS.map((s) => dragDeceleration(dialed("cessna-172", "polar", s), 60)), 1);
    monotone(STRENGTHS.map((s) => dragDeceleration(dialed("f-16", "polar", s), 200)), 1);
  });
  test("derivatives: full-aileron roll rate falls as damping rises (Cessna 172 and F-16)", () => {
    monotone(STRENGTHS.map((s) => peakRollRate(dialed("cessna-172", "derivatives", s), 50)), -1);
    monotone(STRENGTHS.map((s) => peakRollRate(dialed("f-16", "derivatives", s), 110)), -1);
  });
  test("main gear: the take-off roll grows as the wheels hold the nose down harder", () => {
    monotone(STRENGTHS.map((s) => takeoffRoll(dialed("f-16", "mainGear", s))), 1);
  });
  test("wing ground effect: induced drag near the runway falls as the strength rises, never below none", () => {
    const effect = aircraftFromReference("cessna-172").effects?.wingGroundEffect;
    if (effect === undefined) throw new Error("the Cessna has a wing ground effect");
    const factors = STRENGTHS.map((s) => inducedDragFactor(effect, s, 0.93));
    expect(factors[0]).toBe(1);
    monotone(factors, -1);
    expect(factors.at(-1) ?? -1).toBeGreaterThanOrEqual(0);
  });
  test("Mach drag: the Saturn V's burnout speed falls as the drag rises", () => {
    monotone(STRENGTHS.map((s) => ascent(dialed("saturn-v", "machDrag", s)).airspeed), -1);
  });
  test("rotating Earth: the Saturn V's space-fixed speed 30 s up grows as the planet spins faster", () => {
    monotone(STRENGTHS.map((s) => ascent(dialed("saturn-v", "rotatingEarth", s), 30).inertial), 1);
  });
  test("nozzle: thrust on the pad falls as the back-pressure loss rises, never below zero", () => {
    const thrusts = STRENGTHS.map((s) => createRigidAircraft(dialed("saturn-v", "nozzle", s)).tick(0.01, level(1)).thrust);
    monotone(thrusts, -1);
    expect(thrusts.at(-1) ?? -1).toBeGreaterThanOrEqual(0);
  });
  test("rotor inflow: forward speed relieves the induced flow more as the strength rises", () => {
    monotone(STRENGTHS.map((s) => edgewiseRatio(dialed("bo-105", "rotorInflow", s))), 1);
  });
  test("autorotation: the rotor keeps more of its speed after an engine cut as the strength rises", () => {
    monotone(STRENGTHS.map((s) => rotorSpeedAfterCut(dialed("bo-105", "autorotation", s))), 1);
  });

  for (const strength of [0.2, 4]) {
    test(`every effect at ${strength}: each reference airframe stays finite and bounded through a minute of hard flying`, () => {
      for (const id of ["cessna-172", "f-16", "bo-105"] as const) {
        const tuning = everyEffectAt(id, strength);
        const aircraft = airborne(tuning, id === "bo-105" ? 20 : id === "f-16" ? 150 : 50, 2000);
        aircraft.restore({ ...aircraft.snapshot(), rotorSpeed: 1, spool: 1 });
        for (let i = 0; i < 60 * 60; i += 1) {
          const step = aircraft.tick(DT, { throttle: i % 600 < 300 ? 1 : 0.2, pitch: Math.sin(i / 50), roll: Math.sin(i / 37), yaw: Math.sin(i / 23) * 0.5, collective: 0.45 });
          for (const value of [...step.position, ...step.velocity, ...step.orientation, step.pitchRate, step.rollRate, step.yawRate]) expect(Number.isFinite(value)).toBe(true);
          expect(Math.hypot(...step.velocity)).toBeLessThan(700);
          expect(Math.abs(step.rollRate) + Math.abs(step.pitchRate) + Math.abs(step.yawRate)).toBeLessThan(40);
        }
      }
      const rocket = ascent(everyEffectAt("saturn-v", strength));
      expect(Number.isFinite(rocket.inertial)).toBe(true);
      expect(rocket.inertial).toBeLessThan(6000);
    }, 30_000);
  }
});

describe("the dial's ends", () => {
  test("a plain-throttle arcade jet (every effect 0) holds its height and turns", () => {
    const tuning = everyEffectAt("jet", 0);
    const aircraft = airborne(tuning, 150, 1000);
    let step = aircraft.tick(0, level(0.6));
    for (let i = 0; i < 60 * 40; i += 1) {
      const bank = i < 60 * 20 ? 0 : Math.PI / 4;
      const climb = step.velocity[1];
      const pitch = Math.max(-1, Math.min(1, 0.01 * (1000 - step.position[1]) - 0.05 * climb - 0.5 * step.pitchRate + (bank > 0 ? 0.3 : 0)));
      const roll = Math.max(-1, Math.min(1, 2 * (bank - step.bank) - 0.5 * step.rollRate));
      step = aircraft.tick(DT, { throttle: 0.6, pitch, roll, yaw: 0 });
      if (i === 60 * 20) {
        expect(Math.abs(step.position[1] - 1000)).toBeLessThan(40);
        expect(Math.abs(step.heading)).toBeLessThan(0.1);
      }
    }
    expect(Math.abs(step.heading)).toBeGreaterThan(0.5);
    expect(step.airspeed).toBeGreaterThan(80);
  });

  test("an F-16 with thrust lapse at 2 and damping at 0.2 still recovers from a stall", () => {
    const tuning = at("f-16", { thrustLapse: { strength: 2 }, derivatives: { strength: 0.2 } });
    // Level, idle, at 70 m/s falling 40° below the nose: deep past the 32° stall.
    const stall = 40 * (Math.PI / 180);
    const aircraft = createRigidAircraft(tuning, { position: [0, 5000, 0], velocity: [0, -70 * Math.sin(stall), 70 * Math.cos(stall)], groundHeight: () => -1e4 });
    let step = aircraft.tick(DT, level(0));
    expect(step.stalled).toBe(true);
    let recovered = false;
    for (let i = 0; i < 60 * 30 && !recovered; i += 1) {
      const pitch = Math.max(-1, Math.min(1, -2 * (step.angleOfAttack - 0.1) - 0.3 * step.pitchRate));
      step = aircraft.tick(DT, { throttle: 1, pitch, roll: Math.max(-1, Math.min(1, -2 * step.bank - 0.5 * step.rollRate)), yaw: 0 });
      for (const value of [...step.position, ...step.velocity]) expect(Number.isFinite(value)).toBe(true);
      recovered = !step.stalled && step.airspeed > 100 && step.velocity[1] > -5;
    }
    expect(recovered).toBe(true);
    expect(5000 - step.position[1]).toBeLessThan(4000);
  });
});

describe("a fleet is data", () => {
  test("ten trainers from one class with a few overrides each fly, and differ", () => {
    const fleet: AircraftOverrides[] = Array.from({ length: 10 }, (_, i) => ({
      massKg: 900 + 30 * i,
      effects: {
        propeller: { ratedPower: (130 + 8 * i) * 745.7 },
        polar: { strength: 1 - 0.05 * i },
        derivatives: { strength: 0.6 + 0.08 * i },
      },
    }));
    const climbs = fleet.map((overrides) => {
      const aircraft = airborne(aircraftFromReference("trainer", overrides), 40, 500);
      let step = aircraft.tick(0, level(1));
      for (let i = 0; i < 60 * 20; i += 1) {
        const pitch = Math.max(-1, Math.min(1, 0.05 * (step.airspeed - 40) + 0.3 * (0.08 - step.pitch) - 0.3 * step.pitchRate));
        step = aircraft.tick(DT, { throttle: 1, pitch, roll: Math.max(-1, Math.min(1, -2 * step.bank)), yaw: 0 });
      }
      return step.velocity[1];
    });
    for (const climb of climbs) {
      expect(Number.isFinite(climb)).toBe(true);
      expect(climb).toBeGreaterThan(-3);
      expect(climb).toBeLessThan(15);
    }
    expect(new Set(climbs.map((climb) => climb.toFixed(4))).size).toBe(10);
    const third = aircraftFromReference("trainer", fleet[3]);
    expect(third.effects?.propeller?.ratedPower).toBeCloseTo(154 * 745.7, 3);
    expect(third.effects?.polar?.area).toBeCloseTo(16.165, 2);
    expect(third.engine?.maxThrust).toBe(aircraftFromReference("cessna-172").engine?.maxThrust);
  });
});

import { describe, expect, test } from "bun:test";

import type { AxisInput } from "../input/axisInput";
import { createWaveField, regularWaveField } from "../water/seaState";
import { createBoatDynamics, type BoatTuning } from "./boatDynamics";
import { BOAT_REFERENCE_IDS, boatFromReference } from "./boatReferences";
import { tickDrivableVehicle } from "./drivableVehicle";
import { measureHandling } from "./handlingProbe";

const DT = 1 / 60;

const speedboat: BoatTuning = { massKg: 900, length: 6, beam: 2.3, maxThrust: 7000, propSpeed: 30, planingSpeed: 8, steering: { kind: "outboard" } };
const tug: BoatTuning = { massKg: 30000, length: 18, beam: 6, maxThrust: 90000, propSpeed: 9, steering: { kind: "rudder", area: 2.5 } };

function axis(partial: Partial<AxisInput>): AxisInput {
  return { throttle: 0, brake: 0, steer: 0, handbrake: 0, ...partial };
}

function run(boat: ReturnType<typeof createBoatDynamics>, seconds: number, input: AxisInput) {
  let step = boat.tick(DT, input);
  for (let i = 1; i < Math.round(seconds / DT); i += 1) step = boat.tick(DT, input);
  return step;
}

describe("createBoatDynamics", () => {
  test("a planing hull climbs onto the plane and runs well past hull speed", () => {
    const boat = createBoatDynamics(speedboat);
    const step = run(boat, 20, axis({ throttle: 1 }));
    expect(step.planing).toBe(1);
    expect(step.forwardSpeed).toBeGreaterThan(1.34 * Math.sqrt(9.81 * speedboat.length) * 2);
  });

  test("a displacement hull stalls near hull speed and never planes", () => {
    const boat = createBoatDynamics({ ...tug, propSpeed: 30 });
    const step = run(boat, 60, axis({ throttle: 1 }));
    expect(step.planing).toBe(0);
    expect(step.forwardSpeed).toBeLessThan(1.34 * Math.sqrt(9.81 * tug.length) * 1.25);
  });

  test("a rudder needs flow: no turn at rest, a slow turn once the prop washes over it", () => {
    const still = run(createBoatDynamics(tug), 2, axis({ steer: 1 }));
    expect(still.yawRate).toBe(0);
    const washed = run(createBoatDynamics(tug), 2, axis({ steer: 1, throttle: 0.5 }));
    expect(washed.yawRate).toBeLessThan(-0.01);
  });

  test("an outboard swings its thrust, so it turns hard at low speed", () => {
    const boat = run(createBoatDynamics(speedboat), 2, axis({ steer: 1, throttle: 0.5 }));
    const rudder = run(createBoatDynamics(tug), 2, axis({ steer: 1, throttle: 0.5 }));
    expect(boat.yawRate).toBeLessThan(rudder.yawRate * 3);
    expect(boat.steerAngle).toBeGreaterThan(0);
  });

  test("measureHandling reads a boat like any drivable sim", () => {
    const report = measureHandling(() => createBoatDynamics(speedboat), { cornerSpeed: 15 });
    expect(report.topSpeed).toBeGreaterThan(20);
    expect(report.spun).toBe(false);
    expect(report.maxLateralG).toBeGreaterThan(0.1);
  });

  test("tickDrivableVehicle poses a boat entity", () => {
    const boat = createBoatDynamics(speedboat, { position: [0, 2, 0] });
    const drive = tickDrivableVehicle(boat, DT, axis({ throttle: 1 }));
    expect(drive.pose.position[1]).toBe(2);
    expect(drive.step.engineLoad).toBeGreaterThan(0.9);
  });

  test("snapshot and restore replay bit-exactly", () => {
    const boat = createBoatDynamics(speedboat, { waterHeight: (x, z, t) => 0.3 * Math.sin(x * 0.2 + t) + 0.1 * Math.cos(z * 0.3) });
    run(boat, 3, axis({ throttle: 1, steer: 0.4 }));
    const saved = boat.snapshot();
    const a = run(boat, 2, axis({ throttle: 0.7, steer: -1 }));
    boat.restore(saved);
    const b = run(boat, 2, axis({ throttle: 0.7, steer: -1 }));
    expect(b).toEqual(a);
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });

  test("the hull rides the water surface", () => {
    const boat = createBoatDynamics(speedboat, { waterHeight: (_x, _z, t) => 0.5 * Math.sin(t * 2) });
    const heights: number[] = [];
    for (let i = 0; i < 240; i += 1) heights.push(boat.tick(DT, axis({})).position[1]);
    expect(Math.max(...heights)).toBeGreaterThan(0.45);
    expect(Math.min(...heights)).toBeLessThan(-0.45);
  });

  test("a current carries a drifting hull with it", () => {
    const boat = createBoatDynamics(tug, { current: () => [1.5, 0] });
    run(boat, 60, axis({}));
    expect(boat.velocity()[0]).toBeCloseTo(1.5, 1);
    expect(boat.pose().position[0]).toBeGreaterThan(40);
  });

  test("retune takes effect on the next tick", () => {
    const boat = createBoatDynamics(speedboat);
    const slow = run(boat, 10, axis({ throttle: 1 })).forwardSpeed;
    boat.retune({ ...speedboat, maxThrust: 14000, propSpeed: 45 });
    const fast = run(boat, 10, axis({ throttle: 1 })).forwardSpeed;
    expect(fast).toBeGreaterThan(slow + 3);
    expect(boat.tuning().maxThrust).toBe(14000);
  });

  test("reverse thrust backs the boat up and resetTo clears motion", () => {
    const boat = createBoatDynamics(speedboat);
    expect(run(boat, 3, axis({ brake: 1 })).forwardSpeed).toBeLessThan(-0.5);
    boat.resetTo([5, 0, 5], 1);
    expect(boat.velocity()).toEqual([0, 0]);
    expect(boat.pose().heading).toBe(1);
  });
});

describe("createBoatDynamics effects", () => {
  const idle = axis({});

  test("boatFromReference's speedboat climbs onto the plane on its outboard, trims to Savitsky's angle and holds its revs limit", () => {
    const tuning = boatFromReference("speedboat-6m");
    const step = run(createBoatDynamics(tuning), 30, axis({ throttle: 1 }));
    expect(step.forwardSpeed / 0.5144444).toBeGreaterThan(33);
    expect(step.forwardSpeed / 0.5144444).toBeLessThan(39);
    expect(step.planing).toBe(1);
    expect(step.propRevs).toBeGreaterThan(40);
    expect(step.propRevs).toBeLessThanOrEqual(46.7 + 1e-9);
    expect(-step.bodyPitch / (Math.PI / 180)).toBeGreaterThan(1);
    expect(-step.bodyPitch / (Math.PI / 180)).toBeLessThan(3);
    expect(step.thrust).toBeCloseTo(step.resistance, -1);
  });

  test("an effect at strength 0 is the simple model's term again", () => {
    const base = boatFromReference("speedboat-6m");
    const effects = base.effects ?? {};
    const offEverywhere: BoatTuning = { ...base, effects: Object.fromEntries(Object.entries(effects).map(([name, effect]) => [name, { ...effect, strength: 0 }])) };
    const simple: BoatTuning = { ...base, effects: {} };
    const a = run(createBoatDynamics(offEverywhere), 5, axis({ throttle: 1, steer: 0.3 }));
    const b = run(createBoatDynamics(simple), 5, axis({ throttle: 1, steer: 0.3 }));
    const c = run(createBoatDynamics({ massKg: 900, length: 6, beam: 2.3, maxThrust: 7000, propSpeed: 30, planingSpeed: 8, steering: { kind: "outboard" } }), 5, axis({ throttle: 1, steer: 0.3 }));
    expect(a.position).toEqual(b.position);
    expect(b.position).toEqual(c.position);
  });

  test("a resistance effect alone on an arcade hull gives it Holtrop–Mennen drag and nothing else changes", () => {
    const tug: BoatTuning = { massKg: 30000, length: 18, beam: 6, maxThrust: 90000, propSpeed: 9, steering: { kind: "rudder", area: 2.5 } };
    const withDrag: BoatTuning = { ...tug, effects: { resistance: { draft: 1.6, midshipCoefficient: 0.85, waterplaneCoefficient: 0.8 } } };
    const plain = run(createBoatDynamics(tug), 60, axis({ throttle: 1 }));
    const real = run(createBoatDynamics(withDrag), 60, axis({ throttle: 1 }));
    expect(real.resistance).toBeGreaterThan(0);
    expect(real.forwardSpeed).not.toBeCloseTo(plain.forwardSpeed, 2);
    expect(real.propRevs).toBe(0);
  });

  test("seakeeping heaves and pitches a hull on the sea it is given, rolls it in beam seas, and settles when the sea goes calm", () => {
    const tuning = boatFromReference("speedboat-6m");
    const period = 2 * Math.PI / Math.sqrt((2 * Math.PI * 9.81) / 12);
    const head = createBoatDynamics(tuning, { sea: regularWaveField(0.1, period, -Math.PI / 2) });
    let heave = 0;
    let pitch = 0;
    for (let i = 0; i < 1200; i += 1) {
      const step = head.tick(DT, idle);
      if (i > 900) {
        heave = Math.max(heave, Math.abs(step.position[1]));
        pitch = Math.max(pitch, Math.abs(step.bodyPitch));
      }
    }
    expect(heave / 0.1).toBeGreaterThan(0.6);
    expect(heave / 0.1).toBeLessThan(0.95);
    expect(pitch).toBeGreaterThan(0.01);
    const beam = createBoatDynamics(tuning, { sea: regularWaveField(0.1, period, 0) });
    let roll = 0;
    for (let i = 0; i < 900; i += 1) roll = Math.max(roll, Math.abs(beam.tick(DT, idle).bodyRoll));
    expect(roll).toBeGreaterThan(0.01);
    head.setSea(undefined);
    let still = 1;
    for (let i = 0; i < 1200; i += 1) still = Math.abs(head.tick(DT, idle).position[1]);
    expect(still).toBeLessThan(0.01);
  });

  test("seakeeping without a sea reads waterHeight along the hull", () => {
    const tuning: BoatTuning = { ...speedboat, effects: { seakeeping: {} } };
    const boat = createBoatDynamics(tuning, { waterHeight: () => 0.2 });
    const step = run(boat, 20, idle);
    expect(step.position[1]).toBeCloseTo(0.2, 2);
  });

  test("snapshot and restore carry every effect's state, so a replay matches", () => {
    const tuning = boatFromReference("kvlcc2-l7");
    const sea = createWaveField({ significantHeight: 0.05, peakPeriod: 2 }, { seed: 7, components: 12 });
    const boat = createBoatDynamics(tuning, { sea });
    run(boat, 4, axis({ throttle: 1, steer: 0.5 }));
    const saved = boat.snapshot();
    const first = run(boat, 3, axis({ throttle: 1, steer: -0.5 }));
    boat.restore(saved);
    const second = run(boat, 3, axis({ throttle: 1, steer: -0.5 }));
    expect(second.position).toEqual(first.position);
    expect(second.bodyPitch).toBe(first.bodyPitch);
  });

  test("retune swaps an effect's numbers mid-run", () => {
    const tuning = boatFromReference("kvlcc2-l7");
    const resistance = tuning.effects?.resistance;
    if (resistance === undefined) throw new Error("kvlcc2 build lost its resistance");
    const cruising = () => {
      const boat = createBoatDynamics(tuning);
      boat.restore({ ...boat.snapshot(), vz: 1.18 });
      return boat;
    };
    const kept = run(cruising(), 100, axis({ throttle: 1 })).forwardSpeed;
    const fouled = cruising();
    fouled.retune({ ...tuning, effects: { ...tuning.effects, resistance: { ...resistance, coefficient: 3 * (resistance.coefficient ?? 0) } } });
    expect(kept).toBeGreaterThan(1.1);
    expect(run(fouled, 100, axis({ throttle: 1 })).forwardSpeed).toBeLessThan(0.8 * kept);
  });

  test("every reference hull builds and runs", () => {
    for (const id of BOAT_REFERENCE_IDS) {
      const step = run(createBoatDynamics(boatFromReference(id)), 2, axis({ throttle: 1 }));
      expect(Number.isFinite(step.forwardSpeed)).toBe(true);
      expect(step.forwardSpeed).toBeGreaterThan(0);
    }
  });
});

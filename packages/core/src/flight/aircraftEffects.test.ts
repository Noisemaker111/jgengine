import { describe, expect, test } from "bun:test";

import { createRigidAircraft, type RigidAircraftInput } from "./aircraftDynamics";
import { effectStrength, mixEffect } from "./aircraftEffects";
import { AIRCRAFT_REFERENCE_IDS, aircraftFromReference } from "./aircraftReferences";

const DT = 1 / 60;
const input = (i: number): RigidAircraftInput => ({ throttle: 0.9, pitch: 0.2 * Math.sin(i / 40), roll: 0.3 * Math.sin(i / 25), yaw: 0, collective: 0.45 });

describe("aircraft effects", () => {
  test("a strength defaults to 1 and never goes below 0; the blend runs simple to physical then scales", () => {
    expect(effectStrength(undefined)).toBe(0);
    expect(effectStrength({})).toBe(1);
    expect(effectStrength({ strength: -3 })).toBe(0);
    expect(mixEffect(10, 20, 0.5)).toBe(15);
    expect(mixEffect(10, 20, 2)).toBe(40);
  });

  test("every reference airframe snapshots and restores bit for bit with all its effects running", () => {
    for (const id of ["cessna-172", "f-16", "bo-105", "saturn-v"] as const) {
      const tuning = aircraftFromReference(id);
      const options = { position: [0, 1500, 0] as const, velocity: [0, 0, id === "bo-105" ? 20 : id === "saturn-v" ? 0 : 70] as const, groundHeight: () => -1e4 };
      const first = createRigidAircraft(tuning, options);
      first.restore({ ...first.snapshot(), rotorSpeed: 1, spool: 0.5 });
      for (let i = 0; i < 120; i += 1) first.tick(DT, input(i));
      const saved = JSON.parse(JSON.stringify(first.snapshot()));
      const second = createRigidAircraft(tuning, options);
      second.restore(saved);
      for (let i = 120; i < 240; i += 1) {
        const a = first.tick(DT, input(i));
        const b = second.tick(DT, input(i));
        expect(b.position).toEqual(a.position);
        expect(b.orientation).toEqual(a.orientation);
        expect(b.thrust).toBe(a.thrust);
      }
    }
  });

  test("retuning an effect's strength mid-flight takes effect on the next tick", () => {
    const tuning = aircraftFromReference("f-16");
    const aircraft = createRigidAircraft(tuning, { position: [0, 6000, 0], velocity: [0, 0, 180], groundHeight: () => -1e4 });
    aircraft.restore({ ...aircraft.snapshot(), spool: 1 });
    const lapsed = aircraft.tick(DT, { throttle: 0.77, pitch: 0, roll: 0, yaw: 0 }).thrust;
    aircraft.retune(aircraftFromReference("f-16", { effects: { thrustLapse: { strength: 0 } } }));
    const fresh = aircraft.tick(DT, { throttle: 0.77, pitch: 0, roll: 0, yaw: 0 }).thrust;
    expect(fresh).toBeGreaterThan(1.5 * lapsed);
  });

  test("every reference id builds, and the class names start from their airframes", () => {
    for (const id of AIRCRAFT_REFERENCE_IDS) expect(aircraftFromReference(id).massKg).toBeGreaterThan(0);
    expect(aircraftFromReference("trainer")).toEqual(aircraftFromReference("cessna-172"));
    expect(aircraftFromReference("jet").massKg).toBe(aircraftFromReference("f-16").massKg);
    expect(aircraftFromReference("light-helicopter").rotor?.radius).toBe(aircraftFromReference("bo-105").rotor?.radius);
    expect(aircraftFromReference("rocket").motor?.propellantKg).toBe(2071716);
  });
});

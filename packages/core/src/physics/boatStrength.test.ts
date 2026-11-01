import { describe, expect, test } from "bun:test";

import { createWaveField, regularWaveField } from "../water/seaState";
import { createBoatDynamics, type BoatTuning } from "./boatDynamics";
import { boatFromReference, type BoatOverrides } from "./boatReferences";

const DT = 1 / 60;
const KNOT = 0.5144444;

function topSpeed(tuning: BoatTuning, seconds: number): number {
  const boat = createBoatDynamics(tuning);
  let speed = 0;
  for (let i = 0; i < 60 * seconds; i += 1) speed = boat.tick(DT, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }).forwardSpeed;
  return speed;
}

function heaveRatio(tuning: BoatTuning, amplitude: number): number {
  const period = (2 * Math.PI) / Math.sqrt((2 * Math.PI * 9.81) / tuning.length);
  const boat = createBoatDynamics(tuning, { sea: regularWaveField(amplitude, period, -Math.PI / 2) });
  let peak = 0;
  for (let i = 0; i < 60 * 30; i += 1) {
    const y = boat.tick(DT, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }).position[1];
    if (i > 60 * 20) peak = Math.max(peak, Math.abs(y));
  }
  return peak / amplitude;
}

describe("effect strength", () => {
  test("a fifth of the resistance and seakeeping is an arcade boat that still behaves: finite, bounded, through a storm", () => {
    const arcade = boatFromReference("kvlcc2-l7", { effects: { resistance: { strength: 0.2 }, seakeeping: { strength: 0.2 } } });
    const sea = createWaveField({ significantHeight: 0.15, peakPeriod: 1.6, peakEnhancement: 3.3 }, { seed: "storm", components: 16 });
    const boat = createBoatDynamics(arcade, { sea });
    for (let i = 0; i < 60 * 120; i += 1) {
      const step = boat.tick(DT, { throttle: 1, brake: 0, steer: Math.sin(i / 300), handbrake: 0 });
      for (const value of [...step.position, step.forwardSpeed, step.bodyPitch, step.bodyRoll, step.yawRate]) expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(step.position[1])).toBeLessThan(0.5);
      expect(Math.abs(step.forwardSpeed)).toBeLessThan(5);
    }
  });

  test("top speed falls monotonically as resistance strength rises from the simple model to the measured hull", () => {
    const speeds = [0, 0.2, 0.5, 1].map((strength) => topSpeed(boatFromReference("kvlcc2-l7", { effects: { resistance: { strength } } }), 400));
    for (let i = 1; i < speeds.length; i += 1) expect(speeds[i] ?? 0).toBeLessThan(speeds[i - 1] ?? 0);
    expect((speeds[3] ?? 0) / KNOT).toBeCloseTo(2.3, 0);
  });

  test("heave in a boat-length wave falls monotonically from riding the surface (strength 0) to strip theory (strength 1)", () => {
    const ratios = [0, 0.2, 0.5, 1].map((strength) => heaveRatio(boatFromReference("speedboat-6m", { effects: { seakeeping: { strength } } }), 0.05));
    expect(ratios[0] ?? 0).toBeCloseTo(1, 1);
    for (let i = 1; i < ratios.length; i += 1) expect(ratios[i] ?? 0).toBeLessThan(ratios[i - 1] ?? 0);
    expect(ratios[3] ?? 0).toBeCloseTo(0.34, 1);
  });

  test("a fleet is data: ten speedboats from one class with a few overrides each", () => {
    const fleet: BoatOverrides[] = Array.from({ length: 10 }, (_, i) => ({
      massKg: 800 + 40 * i,
      effects: {
        propeller: { engine: { maxRevs: 46.7, maxPower: 60e3 + 8e3 * i } },
        planing: { lcg: (0.34 + 0.01 * i) * 6, strength: 1 - 0.05 * i },
        seakeeping: { strength: i / 9 },
      },
    }));
    const speeds = fleet.map((overrides) => topSpeed(boatFromReference("speedboat-6m", overrides), 25));
    for (const speed of speeds) {
      expect(Number.isFinite(speed)).toBe(true);
      expect(speed / KNOT).toBeGreaterThan(15);
      expect(speed / KNOT).toBeLessThan(60);
    }
    expect(new Set(speeds.map((speed) => speed.toFixed(3))).size).toBe(10);
    expect(boatFromReference("speedboat-6m", fleet[3]).effects?.propeller?.diameter).toBe(0.35);
  });
});

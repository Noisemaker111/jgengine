import { describe, expect, test } from "bun:test";

import { NEUTRAL_AXIS } from "../input/axisInput";
import type { KinematicVehicleTuning } from "./kinematicVehicle";
import {
  createVehicleDamage,
  damagedAxis,
  damagedTuning,
  type VehicleDamageZone,
} from "./vehicleDamage";

const ZONES: readonly VehicleDamageZone[] = [
  {
    id: "front",
    at: [0, 0.4, 1.9],
    thresholds: [10, 25],
    deform: [0, -0.1, -0.35],
    effect: { gripScale: 0.6, engineScale: 0.7, topSpeedScale: 0.8, drag: 0.5 },
  },
  {
    id: "rear-left",
    at: [-0.9, 0.4, -1.8],
    thresholds: [8, 20, 40],
    detachStage: 3,
    effect: { brakeScale: 0.5, steerPull: 0.05 },
  },
];

const BASE: KinematicVehicleTuning = {
  engineAccel: 20,
  brakeAccel: 30,
  topSpeed: 30,
  reverseSpeed: 8,
  turnRate: 2,
  turnSpeedRef: 8,
  gripStrength: 8,
  handbrakeGrip: 0.25,
};

describe("createVehicleDamage", () => {
  test("impulse steps a zone through its thresholds and reports transitions once", () => {
    const damage = createVehicleDamage({ zones: ZONES });
    expect(damage.impact("front", 9)).toBeNull();
    const first = damage.impact("front", 4);
    expect(first?.stage).toBe(1);
    expect(first?.previousStage).toBe(0);
    expect(damage.stageOf("front")).toBe(1);
    expect(damage.impact("front", 4)).toBeNull();
    const second = damage.impact("front", 20);
    expect(second?.stage).toBe(2);
    expect(damage.total()).toBe(37);
  });

  test("hit routes to the nearest zone by local body point", () => {
    const damage = createVehicleDamage({ zones: ZONES });
    const front = damage.hit([0.1, 0.4, 1.7], 12);
    expect(front[0]?.zone).toBe("front");
    const rear = damage.hit([-0.8, 0.4, -1.7], 9);
    expect(rear[0]?.zone).toBe("rear-left");
    expect(damage.stageOf("front")).toBe(1);
    expect(damage.stageOf("rear-left")).toBe(1);
  });

  test("a non-positive impulse or unknown zone changes nothing", () => {
    const damage = createVehicleDamage({ zones: ZONES });
    expect(damage.impact("front", 0)).toBeNull();
    expect(damage.impact("front", -5)).toBeNull();
    expect(damage.impact("missing", 50)).toBeNull();
    expect(damage.total()).toBe(0);
    expect(damage.hit([0, 0, 0], 0)).toEqual([]);
  });

  test("deformation is bounded by the zone's dent and scales with stage", () => {
    const damage = createVehicleDamage({ zones: ZONES });
    expect(damage.deformation()).toEqual([]);
    damage.impact("front", 10);
    const half = damage.deformation().find((entry) => entry.zoneId === "front")!;
    expect(half.offset[2]).toBeCloseTo(-0.35 / 2, 6);
    expect(half.offset[1]).toBeCloseTo(-0.1 / 2, 6);
    damage.impact("front", 100);
    const full = damage.deformation().find((entry) => entry.zoneId === "front")!;
    expect(full.offset[2]).toBeCloseTo(-0.35, 6);
    expect(full.offset[1]).toBeCloseTo(-0.1, 6);
    expect(Math.abs(full.offset[0])).toBeLessThanOrEqual(0.0001);
  });

  test("detachStage hides the part exactly once", () => {
    const damage = createVehicleDamage({ zones: ZONES });
    damage.impact("rear-left", 25);
    const dent = damage.deformation().find((entry) => entry.zoneId === "rear-left")!;
    expect(dent.detached).toBe(false);
    const transition = damage.impact("rear-left", 20);
    expect(transition?.detached).toBe(true);
    expect(damage.deformation().find((entry) => entry.zoneId === "rear-left")!.detached).toBe(true);
    // Already at the last stage and detached: no further transition, and nothing unbounded accumulates.
    expect(damage.impact("rear-left", 100)).toBeNull();
    expect(damage.zones().find((zone) => zone.id === "rear-left")!.detached).toBe(true);
  });

  test("effect interpolates across stages and composes across zones", () => {
    const damage = createVehicleDamage({ zones: ZONES });
    expect(damage.effect()).toEqual({
      gripScale: 1,
      engineScale: 1,
      brakeScale: 1,
      topSpeedScale: 1,
      steerPull: 0,
      drag: 0,
    });
    damage.impact("front", 10);
    const half = damage.effect();
    expect(half.gripScale).toBeCloseTo(0.8, 6);
    expect(half.engineScale).toBeCloseTo(0.85, 6);
    expect(half.drag).toBeCloseTo(0.25, 6);
    damage.impact("front", 100);
    damage.impact("rear-left", 20);
    const full = damage.effect();
    expect(full.gripScale).toBeCloseTo(0.6, 6);
    expect(full.topSpeedScale).toBeCloseTo(0.8, 6);
    expect(full.brakeScale).toBeCloseTo(1 - 0.5 * (2 / 3), 6);
    expect(full.steerPull).toBeCloseTo(0.05 * (2 / 3), 6);
  });

  test("disableAt flips the whole vehicle once total impulse passes it", () => {
    const damage = createVehicleDamage({ zones: ZONES, disableAt: 30 });
    damage.impact("front", 20);
    expect(damage.disabled()).toBe(false);
    const transition = damage.impact("rear-left", 20);
    expect(transition?.disabled).toBe(true);
    expect(damage.disabled()).toBe(true);
  });

  test("modifiers carry the effect into the sim's per-tick overrides", () => {
    const damage = createVehicleDamage({ zones: ZONES });
    damage.impact("front", 100);
    expect(damage.modifiers()).toEqual({
      topSpeedScale: 0.8,
      accelScale: 0.7,
      brakeScale: 1,
      gripScale: 0.6,
    });
  });

  test("snapshot/restore round-trips every zone, total and disabled", () => {
    const damage = createVehicleDamage({ zones: ZONES, disableAt: 40 });
    damage.impact("front", 30);
    damage.impact("rear-left", 15);
    const saved = damage.snapshot();

    const restored = createVehicleDamage({ zones: ZONES, disableAt: 40 });
    restored.restore(saved);
    expect(restored.snapshot()).toEqual(saved);
    expect(restored.effect()).toEqual(damage.effect());
    expect(restored.deformation()).toEqual(damage.deformation());
  });

  test("restore clamps a stage past a zone's thresholds", () => {
    const damage = createVehicleDamage({ zones: ZONES });
    damage.restore({ zones: [{ id: "front", accumulated: 999, stage: 9, detached: false }], total: 999, disabled: false });
    expect(damage.stageOf("front")).toBe(2);
  });

  test("reset clears every zone", () => {
    const damage = createVehicleDamage({ zones: ZONES, disableAt: 10 });
    damage.impact("front", 50);
    damage.reset();
    expect(damage.total()).toBe(0);
    expect(damage.disabled()).toBe(false);
    expect(damage.deformation()).toEqual([]);
    expect(damage.effect().gripScale).toBe(1);
  });

  test("duplicate zone ids are rejected at construction", () => {
    expect(() =>
      createVehicleDamage({ zones: [ZONES[0]!, { ...ZONES[0]!, id: "front" }] }),
    ).toThrow();
  });
});

describe("damage changes handling", () => {
  test("damagedTuning folds the effect into the tuning without mutating the base", () => {
    const damage = createVehicleDamage({ zones: ZONES });
    damage.impact("front", 100);
    const tuned = damagedTuning(BASE, damage.effect());
    expect(tuned.engineAccel).toBeCloseTo(BASE.engineAccel * 0.7, 6);
    expect(tuned.topSpeed).toBeCloseTo(BASE.topSpeed * 0.8, 6);
    expect(tuned.gripStrength).toBeCloseTo(BASE.gripStrength * 0.6, 6);
    expect(tuned.coastDeceleration).toBeCloseTo(0.5, 6);
    expect(BASE.coastDeceleration).toBeUndefined();
    expect(BASE.engineAccel).toBe(20);
  });

  test("damagedAxis adds the steer pull and clamps to the input range", () => {
    const damage = createVehicleDamage({ zones: ZONES });
    damage.impact("rear-left", 40);
    const pulled = damagedAxis(NEUTRAL_AXIS, damage.effect());
    expect(pulled.steer).toBeCloseTo(0.05, 6);
    const clamped = damagedAxis({ ...NEUTRAL_AXIS, steer: 0.99 }, damage.effect());
    expect(clamped.steer).toBe(1);
    expect(damagedAxis(NEUTRAL_AXIS, { gripScale: 1, engineScale: 1, brakeScale: 1, topSpeedScale: 1, steerPull: 0, drag: 0 })).toBe(
      NEUTRAL_AXIS,
    );
  });
});

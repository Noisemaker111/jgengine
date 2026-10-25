import { DEFAULT_GRIP_CURVE, gripCurvePeak, type GripCurve } from "./gripCurve";
import type { VehicleSpec } from "./vehicleSpec";

/** A tunable vehicle number a part can move; each names a numeric {@link VehicleSpec} field. */
export type VehicleStat =
  | "topSpeed"
  | "accel"
  | "brake"
  | "reverseSpeed"
  | "turnRate"
  | "grip"
  | "drift"
  | "handbrakeGrip"
  | "coast"
  | "weight";

/** How one part moves a stat: multiply the base by `scale`, then add `add`. Both default to no change. */
export interface VehiclePartEffect {
  scale?: number;
  add?: number;
}

/**
 * One installable part. `slot` is the caller's own grouping ("tires", "engine", "front-bumper") — the
 * engine does not name slots, so a game's upgrade tree stays its own. Effects compose in install order,
 * and a part's `gripCurve` replaces the base tire compound outright (last one installed wins).
 */
export interface VehiclePart {
  id: string;
  slot: string;
  effects?: Partial<Record<VehicleStat, VehiclePartEffect>>;
  /** Tire compound: replaces the base grip curve when installed. */
  gripCurve?: GripCurve;
}

/**
 * Comparable handling numbers derived from a spec — what "the numbers and the feel" means to a shop
 * screen, a HUD or a test. Grip is reported as the curve's own shape, so a compound change shows up as
 * a moved peak rather than a single scalar.
 */
export interface VehicleFeel {
  topSpeed: number;
  accel: number;
  brake: number;
  turnRate: number;
  handbrakeGrip: number;
  /** Grip available before the tire breaks away, g (the spec's grip times the curve's highest point). */
  peakGrip: number;
  /** Slip where that peak sits — the far end of a flat plateau, so it reads as the breakaway slip. */
  peakSlip: number;
  /** Share of the peak left once the tire is fully sliding (the curve at slip 1 over its peak). */
  slideGrip: number;
}

/** Read the handling numbers out of any spec — base or parts-composed. */
export function feelOf(spec: VehicleSpec): VehicleFeel {
  const curve = gripCurvePeak(spec.gripCurve ?? DEFAULT_GRIP_CURVE);
  return {
    topSpeed: spec.topSpeed,
    accel: spec.accel,
    brake: spec.brake,
    turnRate: spec.turnRate,
    handbrakeGrip: spec.handbrakeGrip ?? 0.5 - 0.1 * (spec.drift ?? 0.2),
    peakGrip: spec.grip * curve.peakGrip,
    peakSlip: curve.peakSlip,
    slideGrip: curve.peakGrip > 0 ? curve.slideGrip / curve.peakGrip : 0,
  };
}

/** A composed vehicle: the spec to build the sim from, the feel it produces, and what was installed. */
export interface VehicleSetup {
  spec: VehicleSpec;
  feel: VehicleFeel;
  /** Installed part ids, in install order. */
  parts: readonly string[];
}

const STAT_DEFAULTS: Record<VehicleStat, (spec: VehicleSpec) => number> = {
  topSpeed: (spec) => spec.topSpeed,
  accel: (spec) => spec.accel,
  brake: (spec) => spec.brake,
  reverseSpeed: (spec) => spec.reverseSpeed ?? Math.min(9, spec.topSpeed * 0.3),
  turnRate: (spec) => spec.turnRate,
  grip: (spec) => spec.grip,
  drift: (spec) => spec.drift ?? 0.2,
  handbrakeGrip: (spec) => spec.handbrakeGrip ?? 0.5 - 0.1 * (spec.drift ?? 0.2),
  coast: (spec) => spec.coast ?? 1,
  weight: (spec) => spec.weight ?? 1300,
};

/**
 * Fold parts onto a base spec: every effect scales then adds onto the running value, in array order,
 * so a setup is deterministic and a caller can reason about which part moved what. The base spec is
 * never mutated, so the same base can seed several builds. Hand `setup.spec` to `vehicleTuning`.
 *
 * @capability vehicle-parts compose data-driven tuning parts (tires, engine, brakes) onto a vehicle spec and read the resulting feel
 */
export function applyVehicleParts(base: VehicleSpec, parts: readonly VehiclePart[]): VehicleSetup {
  const spec: VehicleSpec = { ...base };
  const ids: string[] = [];
  for (const part of parts) {
    ids.push(part.id);
    if (part.gripCurve !== undefined) spec.gripCurve = part.gripCurve;
    if (part.effects === undefined) continue;
    for (const stat of Object.keys(part.effects) as VehicleStat[]) {
      const effect = part.effects[stat];
      if (effect === undefined) continue;
      spec[stat] = STAT_DEFAULTS[stat](spec) * (effect.scale ?? 1) + (effect.add ?? 0);
    }
  }
  return { spec, feel: feelOf(spec), parts: ids };
}

/**
 * Swap a part into its slot: any part already in `next.slot` is removed and `next` takes its place in
 * the same install position, so the order (and therefore the composed numbers) stays stable across an
 * upgrade.
 */
export function withPart(parts: readonly VehiclePart[], next: VehiclePart): VehiclePart[] {
  const at = parts.findIndex((part) => part.slot === next.slot);
  if (at < 0) return [...parts, next];
  const out = parts.slice();
  out[at] = next;
  return out;
}

import type { KinematicVehicleTuning } from "./kinematicVehicle";
import { DEFAULT_GRIP_CURVE, sampleGripCurve, type GripCurve } from "./vehicleBody";

/** A tunable vehicle number a part can move; each names a {@link KinematicVehicleTuning} field. */
export type VehicleStat =
  | "engineAccel"
  | "brakeAccel"
  | "topSpeed"
  | "reverseSpeed"
  | "turnRate"
  | "turnSpeedRef"
  | "gripStrength"
  | "handbrakeGrip"
  | "rollingResistance"
  | "coastDeceleration";

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
 * Comparable handling numbers derived from a tuning — what "the numbers and the feel" means to a shop
 * screen, a HUD or a test. Grip is reported as the curve's own shape, so a compound change shows up as
 * a moved peak rather than a single scalar.
 */
export interface VehicleFeel {
  topSpeed: number;
  engineAccel: number;
  brakeAccel: number;
  turnRate: number;
  handbrakeGrip: number;
  /** Grip available before the tire breaks away (the curve's highest point). */
  peakGrip: number;
  /** Slip where that peak sits — the far end of a flat plateau, so it reads as the breakaway slip. */
  peakSlip: number;
  /** Grip left once the tire is fully sliding (the curve at slip 1). */
  slideGrip: number;
}

/** Read the handling numbers out of any tuning — base or parts-composed. */
export function feelOf(tuning: KinematicVehicleTuning): VehicleFeel {
  const curve = tuning.grip ?? DEFAULT_GRIP_CURVE;
  let peakGrip = 0;
  let peakSlip = 0;
  for (const [slip, grip] of curve.points) {
    if (grip >= peakGrip) {
      peakGrip = grip;
      peakSlip = slip;
    }
  }
  return {
    topSpeed: tuning.topSpeed,
    engineAccel: tuning.engineAccel,
    brakeAccel: tuning.brakeAccel,
    turnRate: tuning.turnRate,
    handbrakeGrip: tuning.handbrakeGrip,
    peakGrip,
    peakSlip,
    slideGrip: sampleGripCurve(curve, 1),
  };
}

/** A composed vehicle: the tuning to hand the sim, the feel it produces, and what was installed. */
export interface VehicleSetup {
  tuning: KinematicVehicleTuning;
  feel: VehicleFeel;
  /** Installed part ids, in install order. */
  parts: readonly string[];
}

function statOf(tuning: KinematicVehicleTuning, stat: VehicleStat): number {
  return tuning[stat] ?? 0;
}

/**
 * Fold parts onto a base tuning: every effect scales then adds onto the running value, in array order,
 * so a setup is deterministic and a caller can reason about which part moved what. The base tuning is
 * never mutated, so the same base can seed several builds.
 *
 * @capability vehicle-parts compose data-driven tuning parts (tires, engine, brakes) onto a vehicle tuning and read the resulting feel
 */
export function applyVehicleParts(
  base: KinematicVehicleTuning,
  parts: readonly VehiclePart[],
): VehicleSetup {
  const tuning: KinematicVehicleTuning = { ...base };
  const ids: string[] = [];
  for (const part of parts) {
    ids.push(part.id);
    if (part.gripCurve !== undefined) tuning.grip = part.gripCurve;
    if (part.effects === undefined) continue;
    for (const stat of Object.keys(part.effects) as VehicleStat[]) {
      const effect = part.effects[stat];
      if (effect === undefined) continue;
      const scaled = statOf(tuning, stat) * (effect.scale ?? 1) + (effect.add ?? 0);
      tuning[stat] = scaled;
    }
  }
  return { tuning, feel: feelOf(tuning), parts: ids };
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

import { DEFAULT_GRIP_CURVE } from "@jgengine/core/physics/gripCurve";
import { damagedSpec, type VehicleDamageEffectResolved } from "@jgengine/core/physics/vehicleDamage";
import type { VehicleDynamicsTuning } from "@jgengine/core/physics/vehicleDynamics";
import { vehicleTuning, type VehicleSpec } from "@jgengine/core/physics/vehicleSpec";
import {
  applyVehicleParts,
  feelOf,
  withPart,
  type VehicleFeel,
  type VehicleStat,
} from "@jgengine/core/physics/vehicleParts";

import type { DriftFoundryPartDef } from "./catalog";
import { partById } from "./catalog";

export interface SwapResult {
  installed: readonly DriftFoundryPartDef[];
  ejected: DriftFoundryPartDef | null;
}

/**
 * Swap a part into the kart: `withPart` owns slot uniqueness and keeps the install position stable, so
 * a mid-run upgrade composes the same numbers as the same build bolted on in the shop.
 */
export function swapPart(installed: readonly DriftFoundryPartDef[], part: DriftFoundryPartDef): SwapResult {
  const previous = installed.find((entry) => entry.slot === part.slot) ?? null;
  return {
    // `withPart` only reshuffles the parts it is given; resolving ids back through the catalog keeps
    // the boot copy (labels, radio lines, grants) attached to the composed handling list.
    installed: withPart(installed, part).map((entry) => partById(entry.id)!),
    ejected: previous !== null && previous.id !== part.id ? previous : null,
  };
}

export interface KartTuning {
  topSpeed: number;
  accel: number;
  turnRate: number;
  jumpPower: number;
  hasPlow: boolean;
  armorCharges: number;
  /** The composed feel spec, damage already baked in. */
  handling: VehicleSpec;
  /** `handling` as the sim tuning `createVehicleDynamics`/`retune` take. */
  sim: VehicleDynamicsTuning;
  /** The handling numbers behind that tuning - what the shop screen, the HUD and tests read. */
  feel: VehicleFeel;
}

/** Brake force as a multiple of engine accel - a kart stops harder than it launches. */
const BRAKE_ACCEL_FACTOR = 1.3;
/** Reverse tops out at this fraction of forward top speed. */
const REVERSE_SPEED_FRACTION = 0.35;
/** Downward acceleration on a hop, world units/s² - snappier than real gravity so airs stay short. */
export const HOP_GRAVITY = 22;
/** Baseline hop every kart gets before `jumpPower` from installed springs is added, m/s. */
export const STUB_HOP_SPEED = 3.2;

const MIN_TOP_SPEED = 3;
const MIN_ACCEL = 4;
const MIN_TURN_RATE = 0.6;

/**
 * The bare chassis the salvage drops bolt onto. Every number here is authored feel for a physics kart
 * down a corridor: quick steering, soft top end, a flat road-load coast and a hop that stays short.
 * Grip is the shared tire curve on a light kart-sized body (1900 mm wheelbase, 1350 mm track, 450 mm
 * centre of mass), so braking or cornering hard moves a little weight without turning the corridor
 * into an ice rink.
 */
export const BASE_HANDLING: VehicleSpec = {
  chassis: { bodyRoll: 0.4, weight: 220, wheelbase: 1.9, trackWidth: 1.35, comHeight: 0.45 },
  brakes: {
    abs: 1,
    brake: 9 * BRAKE_ACCEL_FACTOR,
    // Handbrake drills the kart around loose debris: the tire lets go, the yaw still answers steer.
    handbrakeGrip: 0.45,
  },
  aids: { tractionControl: 0.5775, stability: 1 },
  steering: { selfAlign: 0.6875, steerRate: 4.4, turnRate: 1.7, turnSpeed: 6 },
  engine: { topSpeed: 6.5, accel: 9, reverseSpeed: 6.5 * REVERSE_SPEED_FRACTION, coast: 3.5 },
  tires: { grip: 2, gripCurve: DEFAULT_GRIP_CURVE, drift: 0.35 },
  hop: { speed: STUB_HOP_SPEED, gravity: HOP_GRAVITY },
};

/**
 * Brakes and reverse follow the engine the build actually bolted on, then the authored floors clamp a
 * stripped-down kart to something drivable rather than a trolley.
 */
function finalizeHandling(composed: VehicleSpec): VehicleSpec {
  const topSpeed = Math.max(MIN_TOP_SPEED, composed.engine.topSpeed);
  const accel = Math.max(MIN_ACCEL, composed.engine.accel);
  return {
    ...composed,
    engine: { ...composed.engine, topSpeed, accel, reverseSpeed: topSpeed * REVERSE_SPEED_FRACTION },
    steering: { ...composed.steering, turnRate: Math.max(MIN_TURN_RATE, composed.steering.turnRate) },
    brakes: { ...composed.brakes, brake: accel * BRAKE_ACCEL_FACTOR },
  };
}

/** A part's flat claim on a handling number - the shop screen's "+x km/h, -y steering" readout. */
export function claimedChange(part: DriftFoundryPartDef, stat: VehicleStat): number {
  return part.effects?.[stat]?.add ?? 0;
}

export function tuningFrom(parts: readonly DriftFoundryPartDef[], damage?: VehicleDamageEffectResolved): KartTuning {
  const composed = applyVehicleParts(BASE_HANDLING, parts).spec;
  const handling = finalizeHandling(damage === undefined ? composed : damagedSpec(composed, damage));
  const grants = parts.reduce(
    (total, part) => ({
      plow: total.plow + (part.grants?.plow ?? 0),
      jumpPower: total.jumpPower + (part.grants?.jumpPower ?? 0),
      armor: total.armor + (part.grants?.armor ?? 0),
    }),
    { plow: 0, jumpPower: 0, armor: 0 },
  );
  return {
    topSpeed: handling.engine.topSpeed,
    accel: handling.engine.accel,
    turnRate: handling.steering.turnRate,
    jumpPower: Math.max(0, grants.jumpPower),
    hasPlow: grants.plow > 0,
    armorCharges: Math.max(0, Math.round(grants.armor)),
    handling,
    sim: vehicleTuning(handling),
    feel: feelOf(handling),
  };
}

export function partInSlotId(installed: readonly DriftFoundryPartDef[], slotId: string): string | null {
  return installed.find((entry) => entry.slot === slotId)?.id ?? null;
}

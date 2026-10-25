import {
  createVehicleDamage,
  damagedTuning,
  type VehicleDamage,
  type VehicleDamageState,
  type VehicleDamageTransition,
  type VehicleDamageZone,
} from "@jgengine/core/physics/vehicleDamage";
import type { KinematicVehicleTuning } from "@jgengine/core/world";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

/**
 * Harbor Heat's bodywork. A crash feeds one impulse to the zone nearest the impact; zones step
 * through stages on authored thresholds, each stage costs grip, engine, top speed or steering, and
 * the sum is baked into the shared kinematic tuning with `damagedTuning`. The chassis hull (the
 * `health` pool a car explodes at) stays the game's destroy rule and is not duplicated here.
 *
 * The dent a stage earns (`deformation()`) is data: the shell has no hook to displace a vehicle's
 * rendered model yet, so Harbor applies the handling and keeps the offset for a HUD or a later hook.
 */
export const VEHICLE_ZONES: readonly VehicleDamageZone[] = [
  {
    id: "front",
    at: [0, 0.5, 1.7],
    thresholds: [9, 22, 38],
    deform: [0, -0.04, -0.12],
    effect: { gripScale: 0.7, engineScale: 0.85, steerPull: 0.05, drag: 0.3 },
  },
  {
    id: "rear",
    at: [0, 0.55, -1.7],
    thresholds: [11, 26, 42],
    deform: [0, -0.03, 0.1],
    effect: { topSpeedScale: 0.75, drag: 0.45 },
  },
  {
    id: "left",
    at: [-0.95, 0.5, 0],
    thresholds: [12, 28, 46],
    deform: [0.1, -0.02, 0],
    effect: { gripScale: 0.8, steerPull: -0.05 },
  },
  {
    id: "right",
    at: [0.95, 0.5, 0],
    thresholds: [12, 28, 46],
    deform: [-0.1, -0.02, 0],
    effect: { gripScale: 0.8, steerPull: 0.05 },
  },
];

/** Impulse one hard-crash closing speed carries into the bodywork. */
export function crashImpulse(closingSpeed: number): number {
  return Math.max(0, closingSpeed - 8) * 1.4;
}

/** A [right, forward] direction in the car''s body frame (each -1..1) as a body-space impact point. */
export function bodyPoint(offsetRight: number, offsetForward: number): readonly [number, number, number] {
  return [offsetRight * 0.95, 0.5, offsetForward * 1.7];
}

interface CarDamage {
  damage: VehicleDamage;
  /** The undamaged tuning, so a repair or a stage change re-bakes from the authored numbers. */
  base: KinematicVehicleTuning;
  /** Set once a stage changed handling, so the sim is only retuned when something actually moved. */
  applied: string;
}

const bodyworkOf = perContext((): Map<string, CarDamage> => new Map());

/** The bodywork for one car, built on its first crash from the authored tuning. */
export function carDamage(ctx: GameContext, vehicleId: string, base: KinematicVehicleTuning): VehicleDamage {
  const bodywork = bodyworkOf(ctx);
  const existing = bodywork.get(vehicleId);
  if (existing !== undefined) return existing.damage;
  const damage = createVehicleDamage({ zones: VEHICLE_ZONES, devtoolsName: "harbor.vehicleDamage" });
  bodywork.set(vehicleId, { damage, base, applied: "fresh" });
  return damage;
}

/**
 * Feed one crash into a car's bodywork and re-bake the sim tuning when a stage moved. Returns the
 * transitions so a caller can cue a sound or a HUD line.
 */
export function crashVehicle(
  ctx: GameContext,
  vehicleId: string,
  base: KinematicVehicleTuning,
  input: { closingSpeed: number; offsetRight: number; offsetForward: number },
  retune: (next: KinematicVehicleTuning) => void,
): readonly VehicleDamageTransition[] {
  const damage = carDamage(ctx, vehicleId, base);
  const transitions = damage.hit(bodyPoint(input.offsetRight, input.offsetForward), crashImpulse(input.closingSpeed));
  if (transitions.length === 0) return transitions;
  const record = bodyworkOf(ctx).get(vehicleId)!;
  const effect = damage.effect();
  const signature = `${effect.gripScale}:${effect.engineScale}:${effect.brakeScale}:${effect.topSpeedScale}:${effect.steerPull}:${effect.drag}`;
  if (record.applied !== signature) {
    record.applied = signature;
    retune(damagedTuning(record.base, effect));
  }
  return transitions;
}

/** How a car's bodywork reads on a HUD: total accumulated impulse and the worst zone stage. */
export function vehicleDamageReadout(
  ctx: GameContext,
  vehicleId: string,
): { total: number; worstStage: number; zones: number } | null {
  const record = bodyworkOf(ctx).get(vehicleId);
  if (record === undefined) return null;
  const zones = record.damage.zones();
  return {
    total: record.damage.total(),
    worstStage: zones.reduce((worst, zone) => Math.max(worst, zone.stage), 0),
    zones: zones.length,
  };
}

/** Every live car's bodywork, for the save document. */
export function vehicleDamageSave(ctx: GameContext): Record<string, VehicleDamageState> {
  const out: Record<string, VehicleDamageState> = {};
  for (const [vehicleId, record] of bodyworkOf(ctx)) out[vehicleId] = record.damage.snapshot();
  return out;
}

/** Restore bodywork onto the cars a reload still has, re-baking their handling. */
export function restoreVehicleDamage(
  ctx: GameContext,
  sections: Record<string, VehicleDamageState>,
  tuningOf: (vehicleId: string) => KinematicVehicleTuning | null,
  retune: (vehicleId: string, next: KinematicVehicleTuning) => void,
): void {
  for (const [vehicleId, state] of Object.entries(sections)) {
    const base = tuningOf(vehicleId);
    if (base === null) continue;
    const damage = carDamage(ctx, vehicleId, base);
    damage.restore(state);
    const record = bodyworkOf(ctx).get(vehicleId)!;
    record.applied = "restored";
    retune(vehicleId, damagedTuning(record.base, damage.effect()));
  }
}

/** Swap a car's pre-dent handling (a mod was bought) and return what it drives like now, dents included. */
export function rebaseVehicleDamage(ctx: GameContext, vehicleId: string, base: KinematicVehicleTuning): KinematicVehicleTuning {
  const record = bodyworkOf(ctx).get(vehicleId);
  if (record === undefined) return base;
  record.base = base;
  return damagedTuning(base, record.damage.effect());
}

/** Forget one car's bodywork (it burned or was despawned). */
export function forgetVehicleDamage(ctx: GameContext, vehicleId: string): void {
  const bodywork = bodyworkOf(ctx);
  bodywork.get(vehicleId)?.damage.dispose();
  bodywork.delete(vehicleId);
}

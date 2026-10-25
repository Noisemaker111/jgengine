import { createVehicleDamage, type VehicleDamage, type VehicleDamageZone } from "@jgengine/core/physics/vehicleDamage";

/**
 * Crash damage the corridor can actually deal. Every barricade the kart fails to clear stops it on the
 * nose, so the zones are the two front corners: a hit folds the side the driver steered into, costing
 * top end and bending the steering that way. Thresholds are impulses (see `impactImpulse`); the second
 * stage is a full-speed wall hit at the bare chassis' top speed.
 */
export const KART_DAMAGE_ZONES: readonly VehicleDamageZone[] = [
  {
    id: "nose_left",
    at: [-0.55, 0.3, 1.15],
    thresholds: [6, 14],
    effect: { topSpeedScale: 0.95, steerPull: -0.035 },
  },
  {
    id: "nose_right",
    at: [0.55, 0.3, 1.15],
    thresholds: [6, 14],
    effect: { topSpeedScale: 0.95, steerPull: 0.035 },
  },
];

/** Impulse per km/h of approach speed: a crawl into a gate scuffs it, a full-speed hit folds the nose. */
const IMPULSE_PER_KMH = 0.3;

export function impactImpulse(speedKmh: number): number {
  return Math.max(0, speedKmh) * IMPULSE_PER_KMH;
}

/** The barricade meets the nose corner the driver was steering into. */
export function noseHitPoint(steer: number): readonly [number, number, number] {
  return [steer >= 0 ? 0.55 : -0.55, 0.3, 1.15];
}

export function createKartDamage(): VehicleDamage {
  return createVehicleDamage({ zones: KART_DAMAGE_ZONES });
}

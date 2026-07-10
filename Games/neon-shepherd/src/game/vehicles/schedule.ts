import { TRAVEL_SPAN_HALF } from "../constants";
import type { TierDef } from "../difficulty/tiers";
import type { LaneDef, RoadDef } from "../roads/catalog";
import { VEHICLE_TYPES, type VehicleTypeId } from "./catalog";

export interface ActiveVehicle {
  laneIndex: number;
  vehicle: VehicleTypeId;
  x: number;
  z: number;
  direction: 1 | -1;
}

function mod(a: number, b: number): number {
  const r = a % b;
  return r < 0 ? r + b : r;
}

export function laneDuration(lane: LaneDef, tier: TierDef): number {
  const speed = VEHICLE_TYPES[lane.vehicle].speed * tier.speedMult;
  return (TRAVEL_SPAN_HALF * 2) / speed;
}

function laneActiveTravel(lane: LaneDef, tier: TierDef, t: number): number | null {
  const duration = laneDuration(lane, tier);
  if (lane.fixedTimes !== undefined) {
    const cycle = (lane.cycleLength ?? 30) * tier.periodMult;
    const eff = mod(t, cycle);
    for (const at of lane.fixedTimes) {
      const scaledAt = at * tier.periodMult;
      const travelled = eff - scaledAt;
      if (travelled >= 0 && travelled <= duration) return travelled;
    }
    return null;
  }
  const period = lane.period * tier.periodMult;
  const phase = lane.phaseOffset * tier.periodMult;
  const cyclePos = mod(t - phase, period);
  return cyclePos <= duration ? cyclePos : null;
}

export function laneVehicleX(lane: LaneDef, tier: TierDef, t: number): number | null {
  const travelled = laneActiveTravel(lane, tier, t);
  if (travelled === null) return null;
  const speed = VEHICLE_TYPES[lane.vehicle].speed * tier.speedMult;
  const startX = -lane.direction * TRAVEL_SPAN_HALF;
  return startX + lane.direction * speed * travelled;
}

export function laneCapacity(lane: LaneDef, tier: TierDef): number {
  const duration = laneDuration(lane, tier);
  if (lane.fixedTimes !== undefined) return Math.max(1, lane.fixedTimes.length);
  const period = lane.period * tier.periodMult;
  return Math.max(1, Math.ceil(duration / period) + 1);
}

export function activeVehiclesOnRoad(road: RoadDef, tier: TierDef, t: number): ActiveVehicle[] {
  const out: ActiveVehicle[] = [];
  road.lanes.forEach((lane, laneIndex) => {
    const x = laneVehicleX(lane, tier, t);
    if (x === null) return;
    out.push({ laneIndex, vehicle: lane.vehicle, x, z: road.z + lane.laneOffsetZ, direction: lane.direction });
  });
  return out;
}

export function roadOccupiesBand(road: RoadDef, tier: TierDef, t: number, bandHalfWidth: number): boolean {
  return activeVehiclesOnRoad(road, tier, t).some((vehicle) => {
    const half = VEHICLE_TYPES[vehicle.vehicle].length / 2;
    return vehicle.x - half <= bandHalfWidth && vehicle.x + half >= -bandHalfWidth;
  });
}

export function pointHitByVehicle(
  road: RoadDef,
  tier: TierDef,
  t: number,
  x: number,
  z: number,
  pointRadius: number,
): boolean {
  return activeVehiclesOnRoad(road, tier, t).some((vehicle) => {
    const def = VEHICLE_TYPES[vehicle.vehicle];
    const xOverlap = Math.abs(x - vehicle.x) <= def.length / 2 + pointRadius;
    const zOverlap = Math.abs(z - vehicle.z) <= def.width / 2 + pointRadius;
    return xOverlap && zOverlap;
  });
}

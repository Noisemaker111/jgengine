import { type Vec3, pointAtDistance, pointAtFraction } from "../world/canyonMath";
import { TOTAL_MAIN_LENGTH, forkBranches, mainCumulative, mainPolyline } from "../world/canyon";

export interface TruckSeedConfig {
  readonly id: string;
  readonly label: string;
  readonly pace: number;
  readonly feintProximity: number;
  readonly feintLookahead: number;
}

export const TRUCK_SEEDS: readonly TruckSeedConfig[] = [
  { id: "rookie-run", label: "Rookie Run", pace: 21, feintProximity: 42, feintLookahead: 55 },
  { id: "border-push", label: "Border Push", pace: 25, feintProximity: 32, feintLookahead: 45 },
  { id: "ghost-run", label: "Ghost Run", pace: 29, feintProximity: 24, feintLookahead: 36 },
];

export const DEFAULT_TRUCK_SEED_ID = TRUCK_SEEDS[1].id;

export function truckSeedById(seedId: string): TruckSeedConfig {
  return TRUCK_SEEDS.find((seed) => seed.id === seedId) ?? TRUCK_SEEDS[1];
}

export function truckDistanceAt(t: number, seedId: string): number {
  const seed = truckSeedById(seedId);
  return Math.min(TOTAL_MAIN_LENGTH, Math.max(0, t) * seed.pace);
}

export type TriggerHistory = Readonly<Record<string, boolean>>;

export interface TruckSample {
  readonly position: Vec3;
  readonly mainDistance: number;
  readonly onBranchId: string | null;
}

export function truckPositionAt(t: number, seedId: string, triggerHistory: TriggerHistory): TruckSample {
  const mainDistance = truckDistanceAt(t, seedId);
  for (const fork of forkBranches) {
    if (triggerHistory[fork.id] !== true || fork.toIndex === null) continue;
    const entryDist = mainCumulative[fork.fromIndex];
    const exitDist = mainCumulative[fork.toIndex];
    if (mainDistance >= entryDist && mainDistance <= exitDist) {
      const fraction = exitDist === entryDist ? 0 : (mainDistance - entryDist) / (exitDist - entryDist);
      return { position: pointAtFraction(fork.waypoints, fraction), mainDistance, onBranchId: fork.id };
    }
  }
  return { position: pointAtDistance(mainPolyline, mainDistance), mainDistance, onBranchId: null };
}

export interface FeintTriggerCheck {
  readonly forkId: string;
  readonly triggerAtMainDistance: number;
}

export function pendingFeintTriggers(
  previousMainDistance: number,
  nextMainDistance: number,
  triggerHistory: TriggerHistory,
  seedId: string,
): readonly FeintTriggerCheck[] {
  const seed = truckSeedById(seedId);
  const checks: FeintTriggerCheck[] = [];
  for (const fork of forkBranches) {
    if (triggerHistory[fork.id] !== undefined) continue;
    const triggerAtMainDistance = mainCumulative[fork.fromIndex] - seed.feintLookahead;
    if (previousMainDistance < triggerAtMainDistance && nextMainDistance >= triggerAtMainDistance) {
      checks.push({ forkId: fork.id, triggerAtMainDistance });
    }
  }
  return checks;
}

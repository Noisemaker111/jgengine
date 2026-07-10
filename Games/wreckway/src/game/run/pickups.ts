import { seededStreams } from "@jgengine/core/random/rng";

import { PARTS, type PartIconId } from "../parts/catalog";
import { RUN_SEED } from "./constants";

export interface PickupDef {
  id: string;
  partId: PartIconId;
  position: readonly [number, number, number];
}

const PICKUP_Z: readonly number[] = [30, 50, 80, 115, 165, 195, 225, 255, 315, 350, 385, 420];
const MID_LANE_JITTER = 6;

function buildPickups(): readonly PickupDef[] {
  const stream = seededStreams(RUN_SEED)("pickup-layout");
  return PARTS.map((part, index) => {
    const z = PICKUP_Z[index]!;
    const x = (stream() * 2 - 1) * MID_LANE_JITTER;
    return { id: `pickup_${part.id}`, partId: part.id, position: [x, 0.9, z] };
  });
}

export const PICKUPS: readonly PickupDef[] = buildPickups();

export const PICKUP_RADIUS = 3.2;

export function nearestUncollected(
  position: readonly [number, number, number],
  collected: ReadonlySet<string>,
): PickupDef | null {
  let best: PickupDef | null = null;
  let bestDistance = PICKUP_RADIUS;
  for (const pickup of PICKUPS) {
    if (collected.has(pickup.id)) continue;
    const dx = pickup.position[0] - position[0];
    const dz = pickup.position[2] - position[2];
    const distance = Math.hypot(dx, dz);
    if (distance <= bestDistance) {
      best = pickup;
      bestDistance = distance;
    }
  }
  return best;
}

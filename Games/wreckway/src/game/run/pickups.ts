import { markersInGroup } from "../../editorLayers";
import type { PartIconId } from "../parts/catalog";

export interface PickupDef {
  id: string;
  partId: PartIconId;
  position: readonly [number, number, number];
}

export const PICKUPS: readonly PickupDef[] = markersInGroup("pickup").map((marker) => ({
  id: marker.id,
  partId: marker.meta!["partId"] as PartIconId,
  position: [marker.position.x, marker.position.y, marker.position.z],
}));

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

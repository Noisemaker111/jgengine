import type { PartIconId, DriftFoundryPartDef } from "../parts/catalog";
import { partById } from "../parts/catalog";
import { ROW_SIX_TRACK } from "../tracks/catalog";
import { partInSlotId, swapPart } from "../parts/build";

export interface PickupDef {
  id: string;
  partId: PartIconId;
  /** Route the drop sits on and its run metres there. */
  route: string;
  at: number;
  position: readonly [number, number, number];
}

export type PickupGrant = { status: "rejected" } | {
  status: "accepted";
  installed: readonly DriftFoundryPartDef[];
  part: DriftFoundryPartDef;
  ejected: DriftFoundryPartDef | null;
};

/** Consume only after the swap accepts the requested part into its slot. */
export function grantPickup(pickup: PickupDef, installed: readonly DriftFoundryPartDef[], collected: ReadonlySet<string>): PickupGrant {
  if (collected.has(pickup.id)) return { status: "rejected" };
  const part = partById(pickup.partId);
  if (part === null) return { status: "rejected" };
  const swapped = swapPart(installed, part);
  if (partInSlotId(swapped.installed, part.slot) !== part.id) return { status: "rejected" };
  return { status: "accepted", ...swapped, part };
}

/**
 * Debris drops along each track. The layout is deliberate content, not scatter: it is the upgrade
 * path the barricade gauntlet (see route/gates.ts) is built around, authored per track in
 * tracks/drops.ts. `PICKUPS` is Row Six's.
 */
export const PICKUPS: readonly PickupDef[] = ROW_SIX_TRACK.pickups;

export const PICKUP_RADIUS = 3.2;

export function nearestUncollected(
  position: readonly [number, number, number],
  collected: ReadonlySet<string>,
  pickups: readonly PickupDef[] = PICKUPS,
): PickupDef | null {
  let best: PickupDef | null = null;
  let bestDistance = PICKUP_RADIUS;
  for (const pickup of pickups) {
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

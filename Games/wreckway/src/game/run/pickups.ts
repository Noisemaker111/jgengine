import type { PartIconId } from "../parts/catalog";
import { PARTS } from "../parts/catalog";

export interface PickupDef {
  id: string;
  partId: PartIconId;
  position: readonly [number, number, number];
}

/**
 * Debris drops along the escape route. The layout is deliberate content, not scatter: it is the
 * upgrade path the barricade gauntlet (see route/gates.ts) is built around.
 *
 * Two rules make the plow/jump fantasy load-bearing:
 *  1. The plow blade (front) is the LAST front drop and the coil springs (jump wheels) are the LAST
 *     wheels drop, each dropped on the centerline BEFORE the first barricade that needs it. A kart
 *     that sweeps the route grabs them, and — because no later drop refills those two slots — keeps
 *     them all the way to the exit, clearing every barricade.
 *  2. Every drop sits within a kart-radius of the centerline, so simply driving the corridor collects
 *     the route parts. The gating lives on the barricades, not on hard-to-reach pickups.
 *
 * `atZ` is strictly increasing. The engine order keeps the fast truck engine equipped through the
 * opening sprint and only swaps to the efficient EV once the compactor's first surge has passed.
 */
interface PickupLayoutEntry {
  partId: PartIconId;
  atZ: number;
  laneX: number;
}

const PICKUP_LAYOUT: readonly PickupLayoutEntry[] = [
  { partId: "salvage_v6", atZ: 18, laneX: 0 },
  { partId: "hood_plate", atZ: 30, laneX: -1.5 },
  { partId: "truck_engine", atZ: 44, laneX: 1.5 },
  { partId: "fan_blade_vanes", atZ: 58, laneX: -1 },
  { partId: "steel_rims", atZ: 72, laneX: 1 },
  { partId: "plow_blade", atZ: 88, laneX: 0 }, // last FRONT drop, before the first plow wall (z=110)
  { partId: "monster_treads", atZ: 104, laneX: -1 },
  { partId: "coil_springs", atZ: 126, laneX: 0 }, // last WHEELS drop, before the first jump ramp (z=150)
  { partId: "ev_conversion", atZ: 175, laneX: 1 },
  { partId: "scrap_frame", atZ: 245, laneX: -1 },
  { partId: "roll_cage", atZ: 320, laneX: 1 },
  { partId: "armor_plating", atZ: 410, laneX: 0 },
];

const PICKUP_Y = 0.9;

function buildPickups(): readonly PickupDef[] {
  const known = new Set(PARTS.map((part) => part.id));
  const covered = new Set(PICKUP_LAYOUT.map((entry) => entry.partId));
  for (const part of PARTS) {
    if (!covered.has(part.id)) throw new Error(`pickups: no drop placed for catalog part "${part.id}"`);
  }
  return PICKUP_LAYOUT.map((entry) => {
    if (!known.has(entry.partId)) throw new Error(`pickups: layout references unknown part "${entry.partId}"`);
    return {
      id: `pickup_${entry.partId}`,
      partId: entry.partId,
      position: [entry.laneX, PICKUP_Y, entry.atZ] as const,
    };
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

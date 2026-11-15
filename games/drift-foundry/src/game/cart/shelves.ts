import { seededRng } from "@jgengine/core/random/rng";
import { MAIN_ROUTE } from "@jgengine/core/roads/routeCourse";

import type { Track } from "../tracks/catalog";
import { shelfItemById, type ShelfItem } from "./goods";

/**
 * Where the department's stock sits: grab spots along the shelf edge of the main line, alternating
 * sides, so loading the cart means steering off the racing line toward the shelving and back. A
 * power-up every fourth spot, taking turns through the department's list. Laid from the track's own
 * stock list with a seed per track, so the same aisle always holds the same things in the same places.
 */
export interface ShelfSpot {
  id: string;
  item: ShelfItem;
  route: string;
  /** Run metres. */
  at: number;
  /** Metres left of the centreline. */
  lane: number;
  position: readonly [number, number, number];
}

/** A department's shelf stock: goods ids it sells and the power-ups hidden among them. */
export interface TrackStock {
  goods: readonly string[];
  powerUps: readonly string[];
  /** Metres between grab spots along the main line. */
  spacing?: number;
}

export const GRAB_RADIUS = 3.2;
const DEFAULT_SPACING = 26;
/** Spots keep this far from a barricade so a grab never decides a gate. */
const GATE_CLEARANCE = 9;
const SPOT_Y = 0.9;

/** The lane a shelf spot sits in: just inside the shelving, never past the paved strip by much. */
export function shelfLane(track: Pick<Track, "def">): number {
  return Math.min(track.def.halfWidth - 1.6, track.def.pavedHalfWidth + 2.5);
}

function shuffled<T>(list: readonly T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function layShelves(track: Track): readonly ShelfSpot[] {
  const stock = track.def.stock;
  if (stock === undefined || stock.goods.length === 0) return [];
  const rng = seededRng(`shelves:${track.id}`);
  const spacing = stock.spacing ?? DEFAULT_SPACING;
  const lane = shelfLane(track);
  const spots: ShelfSpot[] = [];
  let index = 0;
  // Goods and power-ups each take turns through a seeded shuffle of the list, so everything the
  // department stocks turns up and no two runs of the same aisle differ.
  const goods = shuffled(stock.goods, rng);
  const powers = shuffled(stock.powerUps, rng);
  let goodsTurn = 0;
  let powerTurn = 0;
  for (let at = 22; at < track.exitAt - 12; at += spacing) {
    if (track.gates.some((gate) => gate.route === MAIN_ROUTE && Math.abs(gate.atZ - at) < GATE_CLEARANCE)) continue;
    const side = index % 2 === 0 ? 1 : -1;
    const power = index % 4 === 3 && stock.powerUps.length > 0;
    const id = power ? powers[powerTurn++ % powers.length]! : goods[goodsTurn++ % goods.length]!;
    const item = shelfItemById(id);
    if (item === null) throw new Error(`shelves: ${track.id} stocks unknown item "${id}"`);
    const point = track.point(MAIN_ROUTE, at, side * lane);
    spots.push({ id: `shelf_${track.id}_${index}`, item, route: MAIN_ROUTE, at, lane: side * lane, position: [point.x, SPOT_Y + point.elevation, point.z] });
    index += 1;
  }
  return spots;
}

export function nearestShelf(position: readonly [number, number, number], taken: ReadonlySet<string>, spots: readonly ShelfSpot[]): ShelfSpot | null {
  let best: ShelfSpot | null = null;
  let bestDistance = GRAB_RADIUS;
  for (const spot of spots) {
    if (taken.has(spot.id)) continue;
    const distance = Math.hypot(spot.position[0] - position[0], spot.position[2] - position[2]);
    if (distance <= bestDistance) {
      best = spot;
      bestDistance = distance;
    }
  }
  return best;
}

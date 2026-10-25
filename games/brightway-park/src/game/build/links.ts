import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { WorldModelState } from "@jgengine/core/worldModel/worldModel";

import { BUILDABLES } from "../objects/catalog";
import { park } from "../park";
import { autoConnect, readNetwork, type Access, type Network } from "./network";
import { LAND_FACT } from "./terrain";

/**
 * The park's network as the live game reads it: worked out again only when something is built or
 * removed or the land moves, and written back to the world as each ride and shop's `closed` fact so
 * the rating, the totals and the dashboard see a shut ride the same way the guests do.
 */

const cache = new WeakMap<object, { land: unknown; net: Network }>();
const EMPTY: Network = { reached: new Set(), access: new Map(), servedBy: new Map() };

export function parkNetwork(ctx: GameContext): Network {
  const state = park.store.read(ctx) as WorldModelState | undefined;
  const instances = state?.instances;
  if (instances === undefined) return EMPTY;
  const w = park.of(ctx);
  const land = w.fact(LAND_FACT);
  const hit = cache.get(instances);
  if (hit !== undefined && hit.land === land) return hit.net;
  const net = readNetwork(w);
  cache.set(instances, { land, net });
  return net;
}

/** A ride or shop's way in; null for anything guests don't visit. */
export function accessOf(ctx: GameContext, id: string): Access | null {
  return parkNetwork(ctx).access.get(id) ?? null;
}

/** Write each ride and shop's `closed` fact from the network. */
export function relinkPark(ctx: GameContext): void {
  const w = park.of(ctx);
  const net = parkNetwork(ctx);
  for (const [id, access] of net.access) {
    const def = BUILDABLES[w.instance(id)?.kind ?? ""];
    if (def === undefined || (def.ride === undefined && def.stall === undefined)) continue;
    const closed = !access.open;
    if (w.fact(`${id}.closed`) !== closed) w.set(`${id}.closed`, closed);
  }
}

/**
 * Lay what joins shut rides and shops to the paths. `free` lays it without charging (the starter
 * park); otherwise each piece is a normal paid build. Returns the ids laid.
 */
export function connectPark(ctx: GameContext, options: { free?: boolean; only?: string } = {}): string[] {
  const w = park.of(ctx);
  const laid = autoConnect(w, (kind, cell) => {
    const result = w.place(kind, { cell }, options.free === true ? { free: true } : undefined);
    return result.ok ? result.id : null;
  }, options.only);
  relinkPark(ctx);
  return laid;
}

/** What it would cost to connect one ride or shop, read off a dry run on a copy of the world. */
export function connectCost(ctx: GameContext, id: string): number {
  const w = park.of(ctx);
  let cost = 0;
  const occupied = new Set<string>();
  autoConnect(w, (kind, cell) => {
    const k = `${cell[0]},${cell[1]}`;
    if (occupied.has(k)) return null;
    occupied.add(k);
    cost += BUILDABLES[kind]?.cost ?? 0;
    return `dry:${k}`;
  }, id);
  return cost;
}

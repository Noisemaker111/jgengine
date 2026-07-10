import { advancePathFollow, createPathFollow, type PathFollowConfig, type PathFollowState, type Waypoint } from "@jgengine/core/nav/pathFollow";

import { iceCellAt, type CorridorId, type IceWorld } from "../ice/grid";
import { CORNER_COUNT, CORRIDOR_LINES, legSampleRange, toWorld } from "../race/track";

export type SledderPersonality = "repeater" | "rotator";

export interface SledderDef {
  readonly id: string;
  readonly entityId: string;
  readonly name: string;
  readonly livery: { readonly primary: string; readonly accent: string };
  readonly personality: SledderPersonality;
  readonly favoriteCorridor: CorridorId;
  readonly speed: number;
}

export const SLEDDERS: readonly SledderDef[] = [
  {
    id: "borealis",
    entityId: "sled_rival_borealis",
    name: "Borealis",
    livery: { primary: "#e63946", accent: "#3a0d10" },
    personality: "repeater",
    favoriteCorridor: "inner",
    speed: 17,
  },
  {
    id: "polaris",
    entityId: "sled_rival_polaris",
    name: "Polaris",
    livery: { primary: "#80ffdb", accent: "#0d2b26" },
    personality: "rotator",
    favoriteCorridor: "mid",
    speed: 15.5,
  },
];

export function sledderById(id: string): SledderDef {
  const found = SLEDDERS.find((s) => s.id === id);
  if (found === undefined) throw new Error(`sledderById: unknown sledder "${id}"`);
  return found;
}

const CORRIDOR_OPTIONS: readonly CorridorId[] = ["inner", "mid", "outer"];
const CRACK_COST = 3;
const OPEN_COST = 500;

export function legCorridorCost(world: IceWorld, corridor: CorridorId, leg: number): number {
  const [start, end] = legSampleRange(leg);
  const line = CORRIDOR_LINES[corridor];
  let cost = 0;
  for (let i = start; i < end; i += 1) {
    const point = line[i % line.length]!;
    const cell = iceCellAt(world, point[0], point[1]);
    if (cell === null) continue;
    if (cell.status === "cracked") cost += CRACK_COST;
    else if (cell.status === "open") cost += OPEN_COST;
  }
  return cost;
}

/**
 * Repeaters ignore the ice entirely (their signature failure mode). Rotators discount
 * cracked ice and strongly avoid open water — ties broken by `rng` for line variance.
 */
export function chooseCorridor(def: SledderDef, world: IceWorld, leg: number, rng: () => number): CorridorId {
  if (def.personality === "repeater") return def.favoriteCorridor;

  let best: CorridorId = CORRIDOR_OPTIONS[0]!;
  let bestCost = Number.POSITIVE_INFINITY;
  let ties: CorridorId[] = [];
  for (const corridor of CORRIDOR_OPTIONS) {
    const cost = legCorridorCost(world, corridor, leg);
    if (cost < bestCost) {
      bestCost = cost;
      best = corridor;
      ties = [corridor];
    } else if (cost === bestCost) {
      ties.push(corridor);
    }
  }
  if (ties.length > 1) return ties[Math.floor(rng() * ties.length) % ties.length]!;
  return best;
}

function legWaypoints(corridor: CorridorId, leg: number): Waypoint[] {
  const [start, end] = legSampleRange(leg);
  const line = CORRIDOR_LINES[corridor];
  const waypoints: Waypoint[] = [];
  for (let i = start; i <= end; i += 1) waypoints.push(toWorld(line[i % line.length]!));
  return waypoints;
}

function legConfig(def: SledderDef, corridor: CorridorId, leg: number): PathFollowConfig {
  return { waypoints: legWaypoints(corridor, leg), speed: def.speed, loop: false };
}

export interface SledderRuntime {
  readonly legIndex: number;
  readonly corridor: CorridorId;
  readonly config: PathFollowConfig;
  readonly follow: PathFollowState;
  readonly lap: number;
}

export function initSledderAtLeg(def: SledderDef, world: IceWorld, rng: () => number, legIndex: number, lap: number): SledderRuntime {
  const corridor = chooseCorridor(def, world, legIndex, rng);
  const config = legConfig(def, corridor, legIndex);
  return { legIndex, corridor, config, follow: createPathFollow(config), lap };
}

export function initSledder(def: SledderDef, world: IceWorld, rng: () => number): SledderRuntime {
  return initSledderAtLeg(def, world, rng, 0, 1);
}

export interface SledderAdvance {
  readonly runtime: SledderRuntime;
  readonly position: readonly [number, number, number];
  readonly heading: number;
  readonly completedLap: boolean;
}

export function advanceSledder(
  def: SledderDef,
  runtime: SledderRuntime,
  world: IceWorld,
  rng: () => number,
  dt: number,
): SledderAdvance {
  let follow = advancePathFollow(runtime.config, runtime.follow, dt);
  let legIndex = runtime.legIndex;
  let corridor = runtime.corridor;
  let config = runtime.config;
  let lap = runtime.lap;
  let completedLap = false;
  let guard = CORNER_COUNT + 1;

  while (follow.done && guard > 0) {
    guard -= 1;
    legIndex += 1;
    if (legIndex >= CORNER_COUNT) {
      legIndex = 0;
      lap += 1;
      completedLap = true;
    }
    corridor = chooseCorridor(def, world, legIndex, rng);
    config = legConfig(def, corridor, legIndex);
    follow = createPathFollow(config);
  }

  return {
    runtime: { legIndex, corridor, config, follow, lap },
    position: follow.position,
    heading: follow.heading,
    completedLap,
  };
}

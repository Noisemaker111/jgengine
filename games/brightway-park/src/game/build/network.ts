import type { WorldModel } from "@jgengine/core/worldModel/worldModel";

import { BUILDABLES } from "../objects/catalog";
import { LOT, sizeOf } from "../lot";
import { cellCentre, levelAt } from "./terrain";

/**
 * The park's footpaths as a network. Guests come in at the gate and can only reach what the paths
 * reach: a shop opens when a path from the gate runs past it, and a ride opens when it has an
 * entrance and an exit touching it, the entrance reached by a path or a queue line from the gate and
 * the exit back onto a path. Queue tiles chained from an entrance are the ride's line: guests stand
 * on them, and a proper line makes a long wait easier to bear.
 */

export const WALK = "path_walk";
export const QUEUE = "path_queue";
export const ENTRANCE = "ride_entrance";
export const EXIT = "ride_exit";
const PATHS = new Set([WALK, QUEUE]);

type Cell = readonly [number, number];
const key = (col: number, row: number): string => `${col},${row}`;
const NEIGHBOURS: readonly Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Path cells at the gate: the bottom rows of the lot, by the turnstiles. */
export function isGateCell(col: number, row: number): boolean {
  const [x, z] = cellCentre(col, row);
  return Math.abs(x) <= 8 && z >= 44;
}

export interface Access {
  open: boolean;
  /** Why it is shut, in words. */
  reason: string | null;
  /** Where guests walk to: the tile in front of a ride's entrance, the shop itself otherwise. */
  door: [number, number] | null;
  /** Where riders come out: the path tile in front of the exit. */
  exit: [number, number] | null;
  /** The ride's queue line, front first, as world points. */
  line: [number, number][];
}

export interface Network {
  /** Every path cell the gate reaches. */
  reached: Set<string>;
  /** Each ride and shop's way in, by instance id. */
  access: Map<string, Access>;
  /** Which ride each entrance or exit serves. */
  servedBy: Map<string, string>;
}

/** Read the paths, entrances and exits off the world and work out what guests can reach. */
export function readNetwork(w: WorldModel): Network {
  const pathAt = new Map<string, string>();
  const footprintAt = new Map<string, string>();
  const instances = w.instances();
  for (const instance of instances) {
    if (instance.cell === null) continue;
    const def = BUILDABLES[instance.kind];
    if (def === undefined) continue;
    const n = sizeOf(def);
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
      const k = key(instance.cell[0] + i, instance.cell[1] + j);
      footprintAt.set(k, instance.id);
      if (PATHS.has(instance.kind)) pathAt.set(k, instance.kind);
    }
  }

  // Flood from the gate along paths and queues; a step may climb or drop one level.
  const reached = new Set<string>();
  const frontier: [number, number][] = [];
  for (const [k] of pathAt) {
    const [col, row] = k.split(",").map(Number) as [number, number];
    if (isGateCell(col, row)) { reached.add(k); frontier.push([col, row]); }
  }
  while (frontier.length > 0) {
    const [col, row] = frontier.pop()!;
    for (const [dc, dr] of NEIGHBOURS) {
      const c = col + dc, r = row + dr, k = key(c, r);
      if (reached.has(k) || !pathAt.has(k)) continue;
      if (Math.abs(levelAt(w, c, r) - levelAt(w, col, row)) > 1) continue;
      reached.add(k);
      frontier.push([c, r]);
    }
  }

  const touches = (cell: Cell, size: number, test: (col: number, row: number) => boolean): boolean => {
    for (let i = -1; i <= size; i += 1) for (let j = -1; j <= size; j += 1) {
      const edge = i === -1 || j === -1 || i === size || j === size;
      const corner = (i === -1 || i === size) && (j === -1 || j === size);
      if (!edge || corner) continue;
      if (test(cell[0] + i, cell[1] + j)) return true;
    }
    return false;
  };

  // Entrances and exits belong to the ride they touch (coaster track counts as the coaster).
  const servedBy = new Map<string, string>();
  const doors = new Map<string, { entrances: { id: string; cell: Cell }[]; exits: { id: string; cell: Cell }[] }>();
  const owners = rideOwners(w);
  for (const instance of instances) {
    if ((instance.kind !== ENTRANCE && instance.kind !== EXIT) || instance.cell === null) continue;
    const cell = instance.cell;
    let ride: string | null = null;
    for (const [dc, dr] of NEIGHBOURS) {
      const owner = owners.get(key(cell[0] + dc, cell[1] + dr));
      if (owner !== undefined) { ride = owner; break; }
    }
    if (ride === null) continue;
    servedBy.set(instance.id, ride);
    const entry = doors.get(ride) ?? { entrances: [], exits: [] };
    (instance.kind === ENTRANCE ? entry.entrances : entry.exits).push({ id: instance.id, cell });
    doors.set(ride, entry);
  }

  const access = new Map<string, Access>();
  for (const instance of instances) {
    const def = BUILDABLES[instance.kind];
    if (def === undefined || instance.cell === null) continue;
    const size = sizeOf(def);
    if (def.stall !== undefined) {
      const open = touches(instance.cell, size, (col, row) => reached.has(key(col, row)));
      const [x, z] = cellCentre(instance.cell[0] + (size - 1) / 2, instance.cell[1] + (size - 1) / 2);
      access.set(instance.id, { open, reason: open ? null : "No path from the gate reaches it", door: [x, z], exit: null, line: [] });
      continue;
    }
    if (def.ride === undefined) continue;
    const entry = doors.get(instance.id);
    if (entry === undefined || entry.entrances.length === 0) {
      access.set(instance.id, { open: false, reason: "Needs an entrance", door: null, exit: null, line: [] });
      continue;
    }
    if (entry.exits.length === 0) {
      access.set(instance.id, { open: false, reason: "Needs an exit", door: null, exit: null, line: [] });
      continue;
    }
    const linked = entry.entrances.find((door) => NEIGHBOURS.some(([dc, dr]) => reached.has(key(door.cell[0] + dc, door.cell[1] + dr))));
    if (linked === undefined) {
      access.set(instance.id, { open: false, reason: "No path or queue reaches the entrance", door: null, exit: null, line: [] });
      continue;
    }
    const out = entry.exits.find((door) => NEIGHBOURS.some(([dc, dr]) => {
      const k = key(door.cell[0] + dc, door.cell[1] + dr);
      return reached.has(k) && pathAt.get(k) === WALK;
    }));
    if (out === undefined) {
      access.set(instance.id, { open: false, reason: "The exit doesn't lead back to a path", door: null, exit: null, line: [] });
      continue;
    }
    // The queue line: queue tiles chained from the entrance, nearest first.
    const line: [number, number][] = [];
    const seen = new Set<string>([key(linked.cell[0], linked.cell[1])]);
    let edge: Cell[] = [linked.cell];
    while (edge.length > 0 && line.length < 40) {
      const next: Cell[] = [];
      for (const cell of edge) for (const [dc, dr] of NEIGHBOURS) {
        const c = cell[0] + dc, r = cell[1] + dr, k = key(c, r);
        if (seen.has(k) || pathAt.get(k) !== QUEUE) continue;
        seen.add(k);
        line.push(cellCentre(c, r));
        next.push([c, r]);
      }
      edge = next;
    }
    // Guests stand on the tile in front of a door, never on the door itself (it is a solid arch).
    const front = (door: Cell, wanted: (k: string) => boolean): [number, number] => {
      for (const [dc, dr] of NEIGHBOURS) {
        const c = door[0] + dc, r = door[1] + dr;
        if (wanted(key(c, r))) return cellCentre(c, r);
      }
      return cellCentre(door[0], door[1]);
    };
    const door = line.length > 0 ? front(linked.cell, (k) => reached.has(k) && pathAt.get(k) === QUEUE) : front(linked.cell, (k) => reached.has(k));
    const exit = front(out.cell, (k) => reached.has(k) && pathAt.get(k) === WALK);
    access.set(instance.id, { open: true, reason: null, door, exit, line });
  }
  return { reached, access, servedBy };
}

/** Which ride each covered cell belongs to: a ride's own footprint, and every track piece for the coaster. */
export function rideOwners(w: WorldModel): Map<string, string> {
  const owners = new Map<string, string>();
  const instances = w.instances();
  const coaster = instances.find((instance) => instance.kind === "ride_coaster")?.id;
  for (const instance of instances) {
    if (instance.cell === null) continue;
    const def = BUILDABLES[instance.kind];
    const owner = def?.ride !== undefined ? instance.id : instance.kind === "track_piece" ? coaster : undefined;
    if (owner === undefined || def === undefined) continue;
    const n = sizeOf(def);
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) owners.set(key(instance.cell[0] + i, instance.cell[1] + j), owner);
  }
  return owners;
}

/** True when an entrance or exit at this cell would stand against a ride (or the coaster's track). */
export function touchesRide(w: WorldModel, cell: Cell): boolean {
  const owners = rideOwners(w);
  return NEIGHBOURS.some(([dc, dr]) => owners.has(key(cell[0] + dc, cell[1] + dr)));
}

const inLot = (c: number, r: number): boolean => c >= 1 && r >= 1 && c < LOT.cols - 1 && r < LOT.rows - 1;

/** Free cells next to any of a body's cells, for laying an entrance, an exit or a path beside it. */
export function freeCellsBeside(body: ReadonlySet<string>, taken: ReadonlySet<string>): [number, number][] {
  const out = new Map<string, [number, number]>();
  for (const k of body) {
    const [col, row] = k.split(",").map(Number) as [number, number];
    for (const [dc, dr] of NEIGHBOURS) {
      const c = col + dc, r = row + dr, nk = key(c, r);
      if (!inLot(c, r) || taken.has(nk) || body.has(nk)) continue;
      out.set(nk, [c, r]);
    }
  }
  return [...out.values()];
}

/** Every covered cell on the lot. */
export function takenCells(w: WorldModel): Set<string> {
  const taken = new Set<string>();
  for (const instance of w.instances()) {
    if (instance.cell === null) continue;
    const n = sizeOf(BUILDABLES[instance.kind]!);
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) taken.add(key(instance.cell[0] + i, instance.cell[1] + j));
  }
  return taken;
}

/**
 * The shortest run of free cells from `from` to a cell beside the reached network, for laying a
 * connecting path. Null when nothing reaches.
 */
export function pathTo(w: WorldModel, from: Cell, reached: ReadonlySet<string>, taken: ReadonlySet<string>): [number, number][] | null {
  const start = key(from[0], from[1]);
  const prev = new Map<string, string | null>([[start, null]]);
  const queue: Cell[] = [from];
  while (queue.length > 0) {
    const cell = queue.shift()!;
    const k = key(cell[0], cell[1]);
    if (NEIGHBOURS.some(([dc, dr]) => reached.has(key(cell[0] + dc, cell[1] + dr)))) {
      const out: [number, number][] = [];
      for (let at: string | null = k; at !== null; at = prev.get(at) ?? null) out.push(at.split(",").map(Number) as [number, number]);
      return out.reverse();
    }
    for (const [dc, dr] of NEIGHBOURS) {
      const c = cell[0] + dc, r = cell[1] + dr, nk = key(c, r);
      if (!inLot(c, r) || prev.has(nk) || taken.has(nk)) continue;
      if (Math.abs(levelAt(w, c, r) - levelAt(w, cell[0], cell[1])) > 1) continue;
      prev.set(nk, k);
      queue.push([c, r]);
    }
  }
  return null;
}

/** How many tiles of a laid connection next to an entrance become its queue line. */
const QUEUE_RUN = 5;

/** Put a piece down at a cell; the caller decides whether the till pays. Returns its id or null. */
export type Lay = (kind: string, cell: [number, number]) => string | null;

/**
 * Join everything that is shut off to the paths from the gate, the way a player would: a shop gets a
 * path to its side; a ride gets an entrance and an exit against it, each with the shortest path back
 * to the network. Returns the ids laid, in order. Things that cannot be reached are left shut.
 */
export function autoConnect(w: WorldModel, lay: Lay, only?: string): string[] {
  const laid: string[] = [];
  const net = readNetwork(w);
  const taken = takenCells(w);
  const reached = new Set(net.reached);
  const walks = new Set([...net.reached].filter((k) => pathKindAt(w, k) === WALK));
  const owners = rideOwners(w);
  const layAll = (kind: string, cells: [number, number][]): boolean => {
    for (const cell of cells) {
      const id = lay(kind, cell);
      if (id === null) return false;
      laid.push(id);
      const k = key(cell[0], cell[1]);
      taken.add(k);
      if (kind === WALK || kind === QUEUE) reached.add(k);
      if (kind === WALK) walks.add(k);
    }
    return true;
  };
  /** The cheapest way to stand a door at one of `candidates` and join it to `to`. */
  const bestDoor = (candidates: [number, number][], to: ReadonlySet<string>): { door: [number, number]; path: [number, number][] } | null => {
    let best: { door: [number, number]; path: [number, number][] } | null = null;
    for (const door of candidates) {
      const dk = key(door[0], door[1]);
      if (NEIGHBOURS.some(([dc, dr]) => to.has(key(door[0] + dc, door[1] + dr)))) return { door, path: [] };
      const blocked = new Set(taken).add(dk);
      for (const [dc, dr] of NEIGHBOURS) {
        const start: [number, number] = [door[0] + dc, door[1] + dr];
        const sk = key(start[0], start[1]);
        if (!inLot(start[0], start[1]) || blocked.has(sk) || owners.has(sk)) continue;
        const path = pathTo(w, start, to, blocked);
        if (path !== null && (best === null || path.length < best.path.length)) best = { door, path };
      }
    }
    return best;
  };
  for (const instance of w.instances()) {
    if (instance.cell === null || (only !== undefined && instance.id !== only)) continue;
    const def = BUILDABLES[instance.kind];
    const access = net.access.get(instance.id);
    if (def === undefined || access === undefined || access.open) continue;
    const body = new Set<string>();
    for (const [k, owner] of owners) if (owner === instance.id) body.add(k);
    if (def.stall !== undefined) {
      const n = sizeOf(def);
      for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) body.add(key(instance.cell[0] + i, instance.cell[1] + j));
      const candidates = freeCellsBeside(body, taken);
      const start = bestDoor(candidates, reached);
      if (start === null) continue;
      if (!layAll(WALK, [start.door, ...start.path])) return laid;
      continue;
    }
    if (def.ride === undefined) continue;
    // Doors the player already stood against it are used where they are; only missing ones are laid.
    const doorsOf = (kind: string): [number, number][] => [...net.servedBy]
      .filter(([id, ride]) => ride === instance.id && w.instance(id)?.kind === kind)
      .map(([id]) => w.instance(id)!.cell!)
      .map((cell) => [cell[0], cell[1]]);
    const entrances = doorsOf(ENTRANCE);
    const entrance = bestDoor(entrances.length > 0 ? entrances : freeCellsBeside(body, taken), reached);
    if (entrance === null) continue;
    if (entrances.length === 0 && !layAll(ENTRANCE, [entrance.door])) return laid;
    // The run up to the entrance is its queue line; anything past the line's length is plain path.
    const line = entrance.path.slice(0, QUEUE_RUN);
    if (!layAll(QUEUE, line) || !layAll(WALK, entrance.path.slice(QUEUE_RUN))) return laid;
    const exits = doorsOf(EXIT);
    const exit = bestDoor(exits.length > 0 ? exits : freeCellsBeside(body, taken), walks);
    if (exit === null) continue;
    if (exits.length === 0 && !layAll(EXIT, [exit.door])) return laid;
    if (!layAll(WALK, exit.path)) return laid;
  }
  return laid;
}

function pathKindAt(w: WorldModel, k: string): string | null {
  const [col, row] = k.split(",").map(Number) as [number, number];
  for (const instance of w.instances()) {
    if (instance.cell !== null && instance.cell[0] === col && instance.cell[1] === row && PATHS.has(instance.kind)) return instance.kind;
  }
  return null;
}

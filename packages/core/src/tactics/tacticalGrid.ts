export type Tile = readonly [number, number];

export interface TacticalGridConfig {
  width: number;
  height: number;
  blocked?: readonly Tile[];
  diagonal?: boolean;
}

export interface ReachableOptions {
  passThrough?: readonly string[];
  diagonal?: boolean;
}

export interface ReachableTile {
  tile: Tile;
  cost: number;
}

export type PushObstacle = "wall" | "edge";

export interface PushCollision {
  mover: string;
  into: string | PushObstacle;
  at: Tile;
}

export interface PushMove {
  id: string;
  from: Tile;
  to: Tile;
}

export interface PushResult {
  moves: PushMove[];
  collisions: PushCollision[];
}

export interface PushOptions {
  distance?: number;
  chain?: boolean;
}

export interface TacticalGridSnapshot {
  blocked: string[];
  occupants: Record<string, string>;
}

export interface TacticalGrid {
  readonly width: number;
  readonly height: number;
  inBounds(tile: Tile): boolean;
  isBlocked(tile: Tile): boolean;
  setBlocked(tile: Tile, blocked: boolean): void;
  occupantAt(tile: Tile): string | null;
  tileOf(id: string): Tile | null;
  place(id: string, tile: Tile): boolean;
  remove(id: string): void;
  move(id: string, tile: Tile): boolean;
  neighbors(tile: Tile, diagonal?: boolean): Tile[];
  reachable(from: Tile, budget: number, options?: ReachableOptions): ReachableTile[];
  path(from: Tile, to: Tile, options?: ReachableOptions): Tile[] | null;
  push(id: string, direction: Tile, options?: PushOptions): PushResult;
  capture(): TacticalGridSnapshot;
  restore(snapshot: TacticalGridSnapshot): void;
}

function key(tile: Tile): string {
  return `${tile[0]},${tile[1]}`;
}

function parseKey(k: string): Tile {
  const [c, r] = k.split(",");
  return [Number(c), Number(r)];
}

export function createTacticalGrid(config: TacticalGridConfig): TacticalGrid {
  const width = config.width;
  const height = config.height;
  const defaultDiagonal = config.diagonal ?? false;
  const blocked = new Set<string>((config.blocked ?? []).map(key));
  const occupants = new Map<string, string>();
  const tiles = new Map<string, Tile>();

  function inBounds(tile: Tile): boolean {
    return tile[0] >= 0 && tile[0] < width && tile[1] >= 0 && tile[1] < height;
  }

  function isBlocked(tile: Tile): boolean {
    return blocked.has(key(tile));
  }

  function occupantAt(tile: Tile): string | null {
    return occupants.get(key(tile)) ?? null;
  }

  function tileOf(id: string): Tile | null {
    const t = tiles.get(id);
    return t === undefined ? null : [t[0], t[1]];
  }

  function place(id: string, tile: Tile): boolean {
    if (!inBounds(tile) || isBlocked(tile)) return false;
    if (occupants.has(key(tile))) return false;
    const prev = tiles.get(id);
    if (prev !== undefined) occupants.delete(key(prev));
    occupants.set(key(tile), id);
    tiles.set(id, [tile[0], tile[1]]);
    return true;
  }

  function remove(id: string): void {
    const t = tiles.get(id);
    if (t === undefined) return;
    occupants.delete(key(t));
    tiles.delete(id);
  }

  function move(id: string, tile: Tile): boolean {
    if (!tiles.has(id)) return false;
    if (!inBounds(tile) || isBlocked(tile)) return false;
    const holder = occupants.get(key(tile));
    if (holder !== undefined && holder !== id) return false;
    const prev = tiles.get(id)!;
    occupants.delete(key(prev));
    occupants.set(key(tile), id);
    tiles.set(id, [tile[0], tile[1]]);
    return true;
  }

  function neighbors(tile: Tile, diagonal = defaultDiagonal): Tile[] {
    const orthogonal: Tile[] = [
      [tile[0] + 1, tile[1]],
      [tile[0] - 1, tile[1]],
      [tile[0], tile[1] + 1],
      [tile[0], tile[1] - 1],
    ];
    const diagonals: Tile[] = [
      [tile[0] + 1, tile[1] + 1],
      [tile[0] + 1, tile[1] - 1],
      [tile[0] - 1, tile[1] + 1],
      [tile[0] - 1, tile[1] - 1],
    ];
    return (diagonal ? [...orthogonal, ...diagonals] : orthogonal).filter(inBounds);
  }

  function enterable(tile: Tile, passThrough: Set<string>): boolean {
    if (!inBounds(tile) || isBlocked(tile)) return false;
    const holder = occupants.get(key(tile));
    return holder === undefined || passThrough.has(holder);
  }

  function reachable(from: Tile, budget: number, options?: ReachableOptions): ReachableTile[] {
    const diagonal = options?.diagonal ?? defaultDiagonal;
    const passThrough = new Set(options?.passThrough ?? []);
    const mover = occupantAt(from);
    if (mover !== null) passThrough.add(mover);
    const best = new Map<string, number>([[key(from), 0]]);
    const frontier: Tile[] = [from];
    while (frontier.length > 0) {
      const current = frontier.shift()!;
      const cost = best.get(key(current))!;
      if (cost >= budget) continue;
      for (const next of neighbors(current, diagonal)) {
        if (!enterable(next, passThrough)) continue;
        const nextCost = cost + 1;
        const known = best.get(key(next));
        if (known !== undefined && known <= nextCost) continue;
        best.set(key(next), nextCost);
        frontier.push(next);
      }
    }
    const result: ReachableTile[] = [];
    for (const [k, cost] of best) {
      if (k === key(from)) continue;
      result.push({ tile: parseKey(k), cost });
    }
    return result.sort((a, b) => a.cost - b.cost || a.tile[0] - b.tile[0] || a.tile[1] - b.tile[1]);
  }

  function path(from: Tile, to: Tile, options?: ReachableOptions): Tile[] | null {
    if (!inBounds(from) || !inBounds(to)) return null;
    const diagonal = options?.diagonal ?? defaultDiagonal;
    const passThrough = new Set(options?.passThrough ?? []);
    const mover = occupantAt(from);
    if (mover !== null) passThrough.add(mover);
    if (key(from) === key(to)) return [[from[0], from[1]]];
    const cameFrom = new Map<string, string>();
    const visited = new Set<string>([key(from)]);
    const frontier: Tile[] = [from];
    while (frontier.length > 0) {
      const current = frontier.shift()!;
      for (const next of neighbors(current, diagonal)) {
        if (visited.has(key(next))) continue;
        const isGoal = key(next) === key(to);
        if (!isGoal && !enterable(next, passThrough)) continue;
        if (!isGoal && isBlocked(next)) continue;
        visited.add(key(next));
        cameFrom.set(key(next), key(current));
        if (isGoal) {
          const chain: Tile[] = [to];
          let step = key(to);
          while (step !== key(from)) {
            step = cameFrom.get(step)!;
            chain.push(parseKey(step));
          }
          return chain.reverse();
        }
        frontier.push(next);
      }
    }
    return null;
  }

  function push(id: string, direction: Tile, options?: PushOptions): PushResult {
    const distance = options?.distance ?? 1;
    const chain = options?.chain ?? false;
    const result: PushResult = { moves: [], collisions: [] };
    const origins = new Map<string, Tile>();

    function record(unitId: string): void {
      const from = origins.get(unitId);
      const to = tileOf(unitId);
      if (from === undefined || to === null) return;
      if (from[0] === to[0] && from[1] === to[1]) return;
      const existing = result.moves.find((m) => m.id === unitId);
      if (existing !== undefined) existing.to = to;
      else result.moves.push({ id: unitId, from, to });
    }

    function pushUnit(unitId: string, steps: number, depth: number): void {
      const start = tileOf(unitId);
      if (start === null) return;
      if (!origins.has(unitId)) origins.set(unitId, start);
      let taken = 0;
      while (taken < steps) {
        const cur = tileOf(unitId)!;
        const next: Tile = [cur[0] + direction[0], cur[1] + direction[1]];
        if (!inBounds(next)) {
          result.collisions.push({ mover: unitId, into: "edge", at: cur });
          break;
        }
        if (isBlocked(next)) {
          result.collisions.push({ mover: unitId, into: "wall", at: cur });
          break;
        }
        const occ = occupantAt(next);
        if (occ !== null) {
          result.collisions.push({ mover: unitId, into: occ, at: cur });
          if (!chain || depth >= width * height) break;
          pushUnit(occ, steps - taken, depth + 1);
          if (occupantAt(next) !== null) break;
        }
        move(unitId, next);
        taken += 1;
      }
      record(unitId);
    }

    pushUnit(id, distance, 0);
    return result;
  }

  return {
    width,
    height,
    inBounds,
    isBlocked,
    setBlocked: (tile, value) => {
      if (value) blocked.add(key(tile));
      else blocked.delete(key(tile));
    },
    occupantAt,
    tileOf,
    place,
    remove,
    move,
    neighbors,
    reachable,
    path,
    push,
    capture: () => {
      const occ: Record<string, string> = {};
      for (const [k, unitId] of occupants) occ[k] = unitId;
      return { blocked: [...blocked], occupants: occ };
    },
    restore: (snapshot) => {
      blocked.clear();
      for (const k of snapshot.blocked) blocked.add(k);
      occupants.clear();
      tiles.clear();
      for (const [k, unitId] of Object.entries(snapshot.occupants)) {
        occupants.set(k, unitId);
        tiles.set(unitId, parseKey(k));
      }
    },
  };
}

import type { Tile } from "./tacticalGrid";

export interface SurfaceKindDef {
  id: string;
  duration?: number;
}

export interface SurfaceReaction {
  when: readonly [string, string];
  result: string | null;
}

export interface SurfaceLayerConfig {
  kinds: readonly SurfaceKindDef[];
  reactions?: readonly SurfaceReaction[];
}

export interface SurfacePatch {
  duration?: number;
}

export type SurfaceEvent =
  | { kind: "apply"; tile: Tile; surface: string }
  | { kind: "react"; tile: Tile; consumed: readonly [string, string]; produced: string | null }
  | { kind: "expire"; tile: Tile; surface: string };

export interface SurfaceCellKind {
  surface: string;
  remaining: number | null;
}

export interface SurfaceCell {
  tile: Tile;
  kinds: SurfaceCellKind[];
}

export type SurfaceLayerSnapshot = Record<string, Record<string, number | null>>;

export interface SurfaceLayer {
  apply(tile: Tile, surface: string, patch?: SurfacePatch): SurfaceEvent[];
  has(tile: Tile, surface: string): boolean;
  kindsAt(tile: Tile): string[];
  remove(tile: Tile, surface: string): void;
  clearTile(tile: Tile): void;
  clear(): void;
  tick(dt: number): SurfaceEvent[];
  cells(): SurfaceCell[];
  capture(): SurfaceLayerSnapshot;
  restore(snapshot: SurfaceLayerSnapshot): void;
}

function key(tile: Tile): string {
  return `${tile[0]},${tile[1]}`;
}

function parseKey(k: string): Tile {
  const [c, r] = k.split(",");
  return [Number(c), Number(r)];
}

function pairKey(a: string, b: string): string {
  return `${a}|${b}`;
}

/** @internal */
export function createSurfaceLayer(config: SurfaceLayerConfig): SurfaceLayer {
  const durations = new Map<string, number | undefined>();
  for (const k of config.kinds) durations.set(k.id, k.duration);

  const reactions = new Map<string, string | null>();
  for (const reaction of config.reactions ?? []) {
    const [a, b] = reaction.when;
    reactions.set(pairKey(a, b), reaction.result);
    reactions.set(pairKey(b, a), reaction.result);
  }

  const cells = new Map<string, Map<string, number | null>>();

  function cellOf(tile: Tile): Map<string, number | null> {
    const k = key(tile);
    let cell = cells.get(k);
    if (cell === undefined) {
      cell = new Map();
      cells.set(k, cell);
    }
    return cell;
  }

  function initialRemaining(surface: string, patch?: SurfacePatch): number | null {
    if (patch?.duration !== undefined) return patch.duration;
    const configured = durations.get(surface);
    return configured === undefined ? null : configured;
  }

  function resolveReactions(tile: Tile, events: SurfaceEvent[]): void {
    const cell = cellOf(tile);
    for (;;) {
      const active = [...cell.keys()];
      let matched: { a: string; b: string; result: string | null } | null = null;
      outer: for (let i = 0; i < active.length; i += 1) {
        for (let j = i + 1; j < active.length; j += 1) {
          const result = reactions.get(pairKey(active[i]!, active[j]!));
          if (result !== undefined) {
            matched = { a: active[i]!, b: active[j]!, result };
            break outer;
          }
        }
      }
      if (matched === null) return;
      cell.delete(matched.a);
      cell.delete(matched.b);
      if (matched.result !== null) cell.set(matched.result, initialRemaining(matched.result));
      events.push({ kind: "react", tile, consumed: [matched.a, matched.b], produced: matched.result });
    }
  }

  return {
    apply: (tile, surface, patch) => {
      const events: SurfaceEvent[] = [];
      const cell = cellOf(tile);
      cell.set(surface, initialRemaining(surface, patch));
      events.push({ kind: "apply", tile, surface });
      resolveReactions(tile, events);
      if (cells.get(key(tile))?.size === 0) cells.delete(key(tile));
      return events;
    },
    has: (tile, surface) => cells.get(key(tile))?.has(surface) ?? false,
    kindsAt: (tile) => [...(cells.get(key(tile))?.keys() ?? [])],
    remove: (tile, surface) => {
      const cell = cells.get(key(tile));
      if (cell === undefined) return;
      cell.delete(surface);
      if (cell.size === 0) cells.delete(key(tile));
    },
    clearTile: (tile) => {
      cells.delete(key(tile));
    },
    clear: () => cells.clear(),
    tick: (dt) => {
      const events: SurfaceEvent[] = [];
      for (const [k, cell] of [...cells]) {
        for (const [surface, remaining] of [...cell]) {
          if (remaining === null) continue;
          const next = remaining - dt;
          if (next <= 0) {
            cell.delete(surface);
            events.push({ kind: "expire", tile: parseKey(k), surface });
          } else {
            cell.set(surface, next);
          }
        }
        if (cell.size === 0) cells.delete(k);
      }
      return events;
    },
    cells: () => {
      const out: SurfaceCell[] = [];
      for (const [k, cell] of cells) {
        out.push({
          tile: parseKey(k),
          kinds: [...cell].map(([surface, remaining]) => ({ surface, remaining })),
        });
      }
      return out;
    },
    capture: () => {
      const snapshot: SurfaceLayerSnapshot = {};
      for (const [k, cell] of cells) {
        const entry: Record<string, number | null> = {};
        for (const [surface, remaining] of cell) entry[surface] = remaining;
        snapshot[k] = entry;
      }
      return snapshot;
    },
    restore: (snapshot) => {
      cells.clear();
      for (const [k, entry] of Object.entries(snapshot)) {
        const cell = new Map<string, number | null>();
        for (const [surface, remaining] of Object.entries(entry)) cell.set(surface, remaining);
        cells.set(k, cell);
      }
    },
  };
}

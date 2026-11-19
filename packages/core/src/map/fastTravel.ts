import type { WorldXZ } from "./minimap";

export interface TravelPointDef<TMeta = unknown> {
  id: string;
  name: string;
  position: WorldXZ;
  region?: string;
  icon?: string;
  initial?: boolean;
  meta?: TMeta;
}

export interface TravelPointView<TMeta = unknown> extends TravelPointDef<TMeta> {
  discovered: boolean;
  discoveredAt: number | null;
  distance?: number;
}

export interface FastTravelSnapshot {
  discovered: Record<string, number>;
}

export interface FastTravelNetwork<TMeta = unknown> {
  discover(id: string): TravelPointView<TMeta> | null;
  isDiscovered(id: string): boolean;
  get(id: string): TravelPointView<TMeta> | null;
  list(from?: WorldXZ): readonly TravelPointView<TMeta>[];
  destinations(from?: WorldXZ): readonly TravelPointView<TMeta>[];
  nearest(from: WorldXZ, options?: { exclude?: string }): TravelPointView<TMeta> | null;
  canTravel(id: string): boolean;
  discoveredCount(): number;
  total(): number;
  subscribe(listener: () => void): () => void;
  snapshot(): FastTravelSnapshot;
  restore(snapshot: FastTravelSnapshot): void;
}

export interface FastTravelOptions<TMeta = unknown> {
  points: readonly TravelPointDef<TMeta>[];
  /** Injected clock (ms). Default `Date.now`. */
  now?: () => number;
  onDiscover?: (point: TravelPointView<TMeta>) => void;
}

function distanceXZ(a: WorldXZ, b: WorldXZ): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** @capability fast-travel network of fast-travel destinations with discovery, distance-sorted queries, nearest lookup, a travel gate, and serializable state */
export function createFastTravelNetwork<TMeta = unknown>(
  options: FastTravelOptions<TMeta>,
): FastTravelNetwork<TMeta> {
  const now = options.now ?? Date.now;
  const order: string[] = [];
  const defs = new Map<string, TravelPointDef<TMeta>>();
  const discoveredAt = new Map<string, number>();
  for (const def of options.points) {
    if (defs.has(def.id)) continue;
    defs.set(def.id, def);
    order.push(def.id);
    if (def.initial === true) discoveredAt.set(def.id, 0);
  }
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function viewOf(id: string, from?: WorldXZ): TravelPointView<TMeta> {
    const def = defs.get(id)!;
    const at = discoveredAt.get(id) ?? null;
    return {
      ...def,
      discovered: at !== null,
      discoveredAt: at,
      ...(from !== undefined ? { distance: distanceXZ(def.position, from) } : {}),
    };
  }

  function views(from?: WorldXZ): TravelPointView<TMeta>[] {
    const all = order.map((id) => viewOf(id, from));
    if (from !== undefined) all.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    return all;
  }

  const network: FastTravelNetwork<TMeta> = {
    discover(id) {
      if (!defs.has(id) || discoveredAt.has(id)) return null;
      discoveredAt.set(id, now());
      const view = viewOf(id);
      options.onDiscover?.(view);
      notify();
      return view;
    },
    isDiscovered(id) {
      return discoveredAt.has(id);
    },
    get(id) {
      return defs.has(id) ? viewOf(id) : null;
    },
    list(from) {
      return views(from);
    },
    destinations(from) {
      return views(from).filter((view) => view.discovered);
    },
    nearest(from, opts = {}) {
      let best: TravelPointView<TMeta> | null = null;
      for (const view of views(from)) {
        if (!view.discovered || view.id === opts.exclude) continue;
        if (best === null || (view.distance ?? 0) < (best.distance ?? 0)) best = view;
      }
      return best;
    },
    canTravel(id) {
      return discoveredAt.has(id);
    },
    discoveredCount() {
      return discoveredAt.size;
    },
    total() {
      return order.length;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return { discovered: Object.fromEntries(discoveredAt) };
    },
    restore(snapshot) {
      discoveredAt.clear();
      for (const id of order) if (defs.get(id)!.initial === true) discoveredAt.set(id, 0);
      for (const [id, at] of Object.entries(snapshot.discovered)) {
        if (defs.has(id)) discoveredAt.set(id, at);
      }
      notify();
    },
  };

  return network;
}

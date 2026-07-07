import { createObservableKeyedStore } from "../store/observableKeyedStore";

export type MarkerPosition = readonly [number, number, number];

export interface MapMarker<TMeta = unknown> {
  id: string;
  kind: string;
  position: MarkerPosition;
  label?: string;
  owner?: string;
  createdAt: number;
  expiresAt?: number;
  meta?: TMeta;
}

export interface MarkerInput<TMeta = unknown> {
  id?: string;
  kind: string;
  position: MarkerPosition;
  label?: string;
  owner?: string;
  createdAt?: number;
  expiresAt?: number;
  meta?: TMeta;
}

export interface MarkerQuery {
  kind?: string;
  owner?: string;
  near?: MarkerPosition;
  radius?: number;
}

/**
 * Visual descriptor for a marker kind. Games supply their own palette; the
 * engine ships `DEFAULT_MARKER_KINDS` as a content-agnostic starting set that
 * the react minimap/compass read for colors and glyphs.
 */
export interface MarkerKindStyle {
  id: string;
  color: string;
  glyph: string;
  priority: number;
}

export const DEFAULT_MARKER_KINDS: Record<string, MarkerKindStyle> = {
  player: { id: "player", color: "#4ade80", glyph: "◆", priority: 90 },
  ally: { id: "ally", color: "#38bdf8", glyph: "▲", priority: 70 },
  objective: { id: "objective", color: "#facc15", glyph: "★", priority: 100 },
  location: { id: "location", color: "#e2e8f0", glyph: "⬡", priority: 40 },
  loot: { id: "loot", color: "#c084fc", glyph: "◈", priority: 60 },
  enemy: { id: "enemy", color: "#f87171", glyph: "✖", priority: 80 },
  danger: { id: "danger", color: "#fb923c", glyph: "⚠", priority: 85 },
  ping: { id: "ping", color: "#22d3ee", glyph: "◎", priority: 65 },
};

export function markerKindStyle(
  kind: string,
  styles: Record<string, MarkerKindStyle> = DEFAULT_MARKER_KINDS,
): MarkerKindStyle {
  return styles[kind] ?? { id: kind, color: "#e2e8f0", glyph: "•", priority: 30 };
}

export interface MarkerSet<TMeta = unknown> {
  add(marker: MarkerInput<TMeta>): string;
  remove(id: string): boolean;
  get(id: string): MapMarker<TMeta> | null;
  list(): readonly MapMarker<TMeta>[];
  query(query: MarkerQuery): MapMarker<TMeta>[];
  prune(now: number): number;
  clear(): void;
  subscribe(listener: () => void): () => void;
  snapshot(): readonly MapMarker<TMeta>[];
}

function distanceXZ(a: MarkerPosition, b: MarkerPosition): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

export function createMarkerSet<TMeta = unknown>(now: () => number = Date.now): MarkerSet<TMeta> {
  const store = createObservableKeyedStore<MapMarker<TMeta>>();
  let counter = 0;

  function generateId(): string {
    let id = `marker-${counter}`;
    while (store.has(id)) {
      counter += 1;
      id = `marker-${counter}`;
    }
    counter += 1;
    return id;
  }

  return {
    add(input) {
      const id = input.id ?? generateId();
      const marker: MapMarker<TMeta> = {
        id,
        kind: input.kind,
        position: input.position,
        createdAt: input.createdAt ?? now(),
      };
      if (input.label !== undefined) marker.label = input.label;
      if (input.owner !== undefined) marker.owner = input.owner;
      if (input.expiresAt !== undefined) marker.expiresAt = input.expiresAt;
      if (input.meta !== undefined) marker.meta = input.meta;
      store.set(id, marker);
      return id;
    },
    remove(id) {
      const existed = store.has(id);
      store.delete(id);
      return existed;
    },
    get(id) {
      return store.get(id) ?? null;
    },
    list() {
      return store.arraySnapshot();
    },
    query(query) {
      return store.arraySnapshot().filter((marker) => {
        if (query.kind !== undefined && marker.kind !== query.kind) return false;
        if (query.owner !== undefined && marker.owner !== query.owner) return false;
        if (query.near !== undefined) {
          const radius = query.radius ?? Number.POSITIVE_INFINITY;
          if (distanceXZ(marker.position, query.near) > radius) return false;
        }
        return true;
      });
    },
    prune(at) {
      let removed = 0;
      for (const marker of store.arraySnapshot()) {
        if (marker.expiresAt !== undefined && marker.expiresAt <= at) {
          store.delete(marker.id);
          removed += 1;
        }
      }
      return removed;
    },
    clear() {
      for (const marker of store.arraySnapshot()) store.delete(marker.id);
    },
    subscribe(listener) {
      return store.subscribe(listener);
    },
    snapshot() {
      return store.arraySnapshot();
    },
  };
}

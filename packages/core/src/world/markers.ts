import { createObservableKeyedStore } from "../store/observableKeyedStore";

export type MarkerPosition = readonly [number, number, number];

/**
 * Small, display-only marker shape consumed by map renderers. Existing games
 * can project their own entities to this view without adopting marker
 * lifecycle storage or duplicating them into a {@link MarkerSet}.
 */
export interface MarkerView<TMeta = unknown> {
  id: string;
  position: MarkerPosition;
  kind?: string;
  label?: string;
  /** Optional world heading in radians for presentations that draw directional markers. */
  heading?: number;
  meta?: TMeta;
}

/** A marker owned by {@link MarkerSet}, including its lifecycle and query fields. */
export interface MapMarker<TMeta = unknown> extends MarkerView<TMeta> {
  kind: string;
  owner?: string;
  createdAt: number;
  expiresAt?: number;
}

export interface MarkerInput<TMeta = unknown> {
  id?: string;
  kind: string;
  position: MarkerPosition;
  label?: string;
  /** Optional world heading in radians for directional map presentations. */
  heading?: number;
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
  waypoint: { id: "waypoint", color: "#f59e0b", glyph: "⚑", priority: 95 },
};

export function markerKindStyle(
  kind: string | undefined,
  styles: Record<string, MarkerKindStyle> = DEFAULT_MARKER_KINDS,
): MarkerKindStyle {
  if (kind === undefined) return { id: "marker", color: "#e2e8f0", glyph: "\u2022", priority: 30 };
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

/**
 * Observable marker snapshots owned by an external project. `getSnapshot`
 * must return the same array identity until the source changes and calls its
 * subscribers, matching React's external-store contract.
 */
export interface MarkerSource<TMarker extends MarkerView = MarkerView> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly TMarker[];
  /** Optional hydration snapshot; omit when the client snapshot is also valid during SSR. */
  getServerSnapshot?: () => readonly TMarker[];
}

/** Marker data accepted by portable consumers: static views, an external source, or a native set. */
export type MarkerCollection<TMarker extends MarkerView = MarkerView> =
  | readonly TMarker[]
  | MarkerSource<TMarker>
  | MarkerSet;

/** Configuration for projecting a caller-owned collection into display-only markers. */
export interface MarkerSourceOptions<TEntity, TMarker extends MarkerView = MarkerView> {
  /** Subscribe to changes in the caller-owned collection. Static collections may omit this. */
  subscribe?: (listener: () => void) => () => void;
  /** Read the current caller-owned collection. Keep its identity stable between changes. */
  getSnapshot: () => readonly TEntity[];
  /** Optional server collection used to keep hydration output deterministic. */
  getServerSnapshot?: () => readonly TEntity[];
  /** Project one caller-owned record into the minimal marker view. */
  project: (value: TEntity, index: number) => TMarker;
}

interface ProjectedSnapshot<TMarker extends MarkerView> {
  invalidate(): void;
  read(): readonly TMarker[];
}

function projectedSnapshot<TEntity, TMarker extends MarkerView>(
  readSource: () => readonly TEntity[],
  project: (value: TEntity, index: number) => TMarker,
): ProjectedSnapshot<TMarker> {
  let dirty = true;
  let source: readonly TEntity[] | undefined;
  let snapshot: readonly TMarker[] = [];
  return {
    invalidate() {
      dirty = true;
    },
    read() {
      const next = readSource();
      if (dirty || next !== source) {
        source = next;
        snapshot = next.map(project);
        dirty = false;
      }
      return snapshot;
    },
  };
}

/**
 * Adapt a caller-owned array/store to an observable marker source. Projection
 * is cached between source changes, so React reads do not copy the collection
 * per frame. The caller retains ownership of entities, updates, persistence,
 * and subscription scheduling.
 *
 * @capability portable-marker-source project caller-owned arrays or subscribable stores into cached minimap marker snapshots without a MarkerSet
 */
export function createMarkerSource<TEntity, TMarker extends MarkerView = MarkerView>(
  options: MarkerSourceOptions<TEntity, TMarker>,
): MarkerSource<TMarker> {
  const client = projectedSnapshot(options.getSnapshot, options.project);
  const server =
    options.getServerSnapshot === undefined
      ? client
      : projectedSnapshot(options.getServerSnapshot, options.project);
  return {
    subscribe(listener) {
      if (options.subscribe === undefined) return () => undefined;
      return options.subscribe(() => {
        client.invalidate();
        listener();
      });
    },
    getSnapshot: client.read,
    getServerSnapshot: server.read,
  };
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
      if (input.heading !== undefined) marker.heading = input.heading;
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

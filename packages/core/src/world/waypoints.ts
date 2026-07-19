import {
  compassBearing,
  headingToBearing,
  relativeBearing,
  type WorldXZ,
} from "./minimap";
import type { MarkerSet } from "./markers";

/** A single player-placed waypoint. World-XZ only — serializable and renderer-free. */
export interface WaypointEntry {
  id: string;
  position: WorldXZ;
  kind: string;
  label?: string;
}

/** Direction/range to the tracked waypoint, for an on-screen guide arrow. */
export interface WaypointGuidance {
  id: string;
  /** XZ distance in world units. */
  distance: number;
  /** Absolute compass bearing (radians) from the query point to the waypoint. */
  bearing: number;
  /** Bearing relative to facing, wrapped to (−π, π]; 0 = dead ahead. Rotate the arrow by this. */
  relative: number;
}

/** Whole serializable state of a {@link WaypointStore} — drop into a save blob. */
export interface WaypointSnapshot {
  waypoints: readonly WaypointEntry[];
  tracked: string | null;
}

/** Player-owned waypoint layer — place/track/clear pins, mirror to a `MarkerSet`, and read guide-arrow data. */
export interface WaypointStore {
  /** Drop a waypoint at a world-XZ point. Returns its id; `track: true` makes it the followed one. */
  place(position: WorldXZ, options?: { id?: string; kind?: string; label?: string; track?: boolean }): string;
  remove(id: string): boolean;
  clear(): void;
  list(): readonly WaypointEntry[];
  get(id: string): WaypointEntry | null;
  /** Follow a waypoint (drives {@link WaypointStore.guidance}); returns false if the id is unknown. */
  track(id: string): boolean;
  clearTrack(): void;
  tracked(): WaypointEntry | null;
  /** Bearing/distance to the tracked waypoint from `from` facing `facingYaw`; null when nothing is tracked. */
  guidance(from: WorldXZ, facingYaw?: number): WaypointGuidance | null;
  subscribe(listener: () => void): () => void;
  snapshot(): WaypointSnapshot;
  restore(snapshot: WaypointSnapshot): void;
}

/** Construction options for {@link createWaypointStore}. */
export interface WaypointStoreDeps {
  /** Optional MarkerSet to mirror waypoints into, so every map surface renders them with no extra wiring. */
  markers?: MarkerSet;
  /** Marker/waypoint kind applied when `place` gets no explicit `kind`. Default `"waypoint"`. */
  defaultKind?: string;
}

/**
 * Player-owned waypoint layer: place/track/clear pins, mirror them into a shared
 * `MarkerSet` (so `Minimap`/`WorldMap`/`Compass` render them for free), and read
 * bearing/distance guidance for an on-screen arrow to the tracked one. State is
 * plain data — `snapshot()`/`restore()` round-trip through any save blob.
 *
 * @capability waypoint-store serializable player waypoint layer — place/track/clear pins, mirror to a MarkerSet, and on-screen bearing/distance guidance for the tracked waypoint
 */
export function createWaypointStore(deps: WaypointStoreDeps = {}): WaypointStore {
  const defaultKind = deps.defaultKind ?? "waypoint";
  const markers = deps.markers;
  const entries = new Map<string, WaypointEntry>();
  const listeners = new Set<() => void>();
  let tracked: string | null = null;
  let counter = 0;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function generateId(): string {
    let id = `waypoint-${counter}`;
    while (entries.has(id)) {
      counter += 1;
      id = `waypoint-${counter}`;
    }
    counter += 1;
    return id;
  }

  function mirror(entry: WaypointEntry): void {
    if (markers === undefined) return;
    markers.add({
      id: entry.id,
      kind: entry.kind,
      position: [entry.position[0], 0, entry.position[1]],
      ...(entry.label !== undefined ? { label: entry.label } : {}),
      meta: { waypoint: true },
    });
  }

  function unmirror(id: string): void {
    markers?.remove(id);
  }

  const store: WaypointStore = {
    place(position, options = {}) {
      const id = options.id ?? generateId();
      const entry: WaypointEntry = {
        id,
        position: [position[0], position[1]],
        kind: options.kind ?? defaultKind,
        ...(options.label !== undefined ? { label: options.label } : {}),
      };
      entries.set(id, entry);
      mirror(entry);
      if (options.track === true) tracked = id;
      notify();
      return id;
    },
    remove(id) {
      const existed = entries.delete(id);
      if (existed) {
        unmirror(id);
        if (tracked === id) tracked = null;
        notify();
      }
      return existed;
    },
    clear() {
      for (const id of entries.keys()) unmirror(id);
      entries.clear();
      tracked = null;
      notify();
    },
    list() {
      return [...entries.values()];
    },
    get(id) {
      return entries.get(id) ?? null;
    },
    track(id) {
      if (!entries.has(id)) return false;
      tracked = id;
      notify();
      return true;
    },
    clearTrack() {
      if (tracked === null) return;
      tracked = null;
      notify();
    },
    tracked() {
      return tracked === null ? null : entries.get(tracked) ?? null;
    },
    guidance(from, facingYaw = 0) {
      const entry = store.tracked();
      if (entry === null) return null;
      const bearing = compassBearing(from, entry.position);
      return {
        id: entry.id,
        distance: Math.hypot(entry.position[0] - from[0], entry.position[1] - from[1]),
        bearing,
        relative: relativeBearing(bearing, headingToBearing(facingYaw)),
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return { waypoints: store.list(), tracked };
    },
    restore(snapshot) {
      for (const id of entries.keys()) unmirror(id);
      entries.clear();
      for (const entry of snapshot.waypoints) {
        const restored: WaypointEntry = {
          id: entry.id,
          position: [entry.position[0], entry.position[1]],
          kind: entry.kind,
          ...(entry.label !== undefined ? { label: entry.label } : {}),
        };
        entries.set(restored.id, restored);
        mirror(restored);
      }
      tracked = snapshot.tracked !== null && entries.has(snapshot.tracked) ? snapshot.tracked : null;
      notify();
    },
  };

  return store;
}

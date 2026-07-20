/**
 * A world position projected to screen space by the caller's camera. This is the
 * minimal shape {@link layoutScreenMarker} consumes — deliberately a structural
 * subset of `@jgengine/react`'s `EntityScreenProjection` (and what its
 * `ProjectEntity`/`useWorldProjection` produce), mirrored here because `core`
 * imports nothing higher. Feed it straight from a world→screen projector.
 */
export interface ScreenProjection {
  /** CSS px from the viewport's left edge. */
  x: number;
  /** CSS px from the viewport's top edge. */
  y: number;
  /** Optional depth key (larger = farther); carried through untouched, unused by the math. */
  depth?: number;
  /**
   * `true` when the point is behind the camera. Such a projection's `x`/`y` are
   * mirrored through the origin, so the layout flips the bearing to point at the
   * real off-screen direction rather than trusting the raw coordinates.
   */
  behind?: boolean;
}

/** The `{ width, height }` of the viewport the marker is laid out within (CSS px). */
export interface ScreenMarkerViewport {
  width: number;
  height: number;
}

/** Options for {@link layoutScreenMarker}. */
export interface ScreenMarkerOptions {
  /**
   * Inset (px) from each viewport edge that an off-screen/behind marker is
   * clamped inside, so a directional arrow sits fully on-frame rather than half
   * off the edge. Default `24`.
   */
  margin?: number;
  /**
   * Optional result object to write into and return, so a per-frame layout over
   * many waypoints allocates nothing. Omit to get a fresh object each call.
   */
  out?: ScreenMarkerLayout;
}

/** Where and how to draw one marker, from {@link layoutScreenMarker}. */
export interface ScreenMarkerLayout {
  /**
   * `true` when the target projects inside the viewport in front of the camera —
   * draw an on-screen pin at `(x, y)`. `false` when it is off-screen or behind —
   * draw a directional arrow clamped to the edge, rotated by `angle`.
   */
  onScreen: boolean;
  /** Screen x to place the marker (px). On-screen: the projection; else clamped to the edge. */
  x: number;
  /** Screen y to place the marker (px). On-screen: the projection; else clamped to the edge. */
  y: number;
  /**
   * Bearing from the viewport center toward the target, in radians (`atan2`
   * convention: `0` = +x/right, `PI/2` = +y/down). Rotate an arrow glyph by this
   * so it points at the target; also meaningful for an on-screen pin.
   */
  angle: number;
}

/**
 * Pure, allocation-aware screen-marker math: given a projected target point, the
 * viewport, and a `margin`, decide whether the target is on-screen and where to
 * draw its marker. An on-screen point passes straight through (`onScreen: true`).
 * An off-screen — or behind-camera — point is CLAMPED to the viewport edge (inset
 * by `margin`) with `angle` set to the bearing from screen center toward the
 * target, so a caller can pin an arrow to the frame edge and rotate it to point
 * the way. Behind-camera projections have mirrored coordinates, so the bearing is
 * flipped to face the true direction. This is the edge-clamp/arrow half that
 * `layoutEntityFrames` lacks (it culls off-screen entries instead). No allocation
 * when an `out` object is supplied — reuse one across a whole frame's waypoints.
 *
 * @capability offscreen-markers pure edge-clamp + bearing math turning a projected point into an on-screen pin or an off-screen directional arrow clamped to the viewport edge
 */
export function layoutScreenMarker(
  projection: ScreenProjection,
  viewport: ScreenMarkerViewport,
  options: ScreenMarkerOptions = {},
): ScreenMarkerLayout {
  const margin = options.margin ?? 24;
  const out = options.out ?? { onScreen: false, x: 0, y: 0, angle: 0 };
  const { width, height } = viewport;
  const cx = width / 2;
  const cy = height / 2;
  const behind = projection.behind === true;

  // Direction from screen center to the target; flip it when the point is behind
  // the camera (its projected coords are mirrored through the origin).
  let dx = projection.x - cx;
  let dy = projection.y - cy;
  if (behind) {
    dx = -dx;
    dy = -dy;
  }
  // Degenerate: target sits exactly at center — pick a stable downward bearing.
  if (dx === 0 && dy === 0) dy = 1;
  const angle = Math.atan2(dy, dx);

  const onScreen =
    !behind &&
    projection.x >= 0 &&
    projection.x <= width &&
    projection.y >= 0 &&
    projection.y <= height;

  if (onScreen) {
    out.onScreen = true;
    out.x = projection.x;
    out.y = projection.y;
    out.angle = angle;
    return out;
  }

  // Clamp along the center→target ray to the rectangle inset by `margin`.
  const hx = Math.max(0, width / 2 - margin);
  const hy = Math.max(0, height / 2 - margin);
  // Scale the direction so the longer axis just reaches its half-extent.
  const scaleX = dx === 0 ? Infinity : hx / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : hy / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  const safeScale = Number.isFinite(scale) ? scale : 0;

  out.onScreen = false;
  out.x = cx + dx * safeScale;
  out.y = cy + dy * safeScale;
  out.angle = angle;
  return out;
}

/** A tracked objective/waypoint the game wants a screen marker for. */
export interface Waypoint {
  /** Stable id — the key for `set`/`remove` and React lists. */
  id: string;
  /** World-space anchor `[x, y, z]` the caller projects to screen space. */
  position: readonly [number, number, number];
  /**
   * Free-string label the game owns and styles ("objective", "loot", "ally", …).
   * The model never interprets it — it only carries it through so a game can
   * color/skin per kind.
   */
  kind: string;
  /** Optional display label ("Extraction", "Ammo cache", …). */
  label?: string;
}

/** Serializable state of a {@link WaypointTracker}, for save/restore. */
export interface WaypointSnapshot {
  /** Every tracked waypoint, in insertion order. */
  waypoints: readonly Waypoint[];
}

/** An observable, serializable set of world waypoints keyed by id. */
export interface WaypointTracker {
  /** Add or replace the waypoint with this id. Notifies subscribers. */
  set(waypoint: Waypoint): void;
  /** Remove the waypoint with this id, if present. Notifies when it existed. */
  remove(id: string): void;
  /** Remove every waypoint. Notifies when the set was non-empty. */
  clear(): void;
  /** The tracked waypoint with this id, or `undefined`. */
  get(id: string): Waypoint | undefined;
  /** Every tracked waypoint, in insertion order (a fresh array — safe to retain). */
  all(): readonly Waypoint[];
  /** How many waypoints are tracked. */
  size(): number;
  /** Observe changes (set, remove, clear, restore). Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** Serializable state for a save. */
  snapshot(): WaypointSnapshot;
  /** Restore from a {@link WaypointSnapshot}, replacing the current set. */
  restore(snapshot: WaypointSnapshot): void;
}

/**
 * A serializable, observable tracker of world waypoints — the objective/point-of-
 * interest half of offscreen markers. A game `set`s waypoints by id (each an
 * `{ id, position, kind, label? }`, where `kind` is a free string the game styles
 * and the model never branches on), and a React host projects each to screen space
 * and lays it out with {@link layoutScreenMarker}: an on-screen pin, or an
 * off-screen directional arrow clamped to the viewport edge with a distance the
 * caller computes. Purely a model — no camera, projection, or renderer here.
 * `snapshot`/`restore` round-trips the set through a save.
 *
 * @capability offscreen-markers serializable waypoint tracker + pure edge-clamp/bearing math for on-screen pins and off-screen directional arrows with distance
 */
export function createWaypointTracker(): WaypointTracker {
  // Insertion-ordered map keeps `all()`/snapshot stable across sets.
  const waypoints = new Map<string, Waypoint>();
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return {
    set(waypoint) {
      waypoints.set(waypoint.id, waypoint);
      notify();
    },
    remove(id) {
      if (waypoints.delete(id)) notify();
    },
    clear() {
      if (waypoints.size === 0) return;
      waypoints.clear();
      notify();
    },
    get(id) {
      return waypoints.get(id);
    },
    all() {
      return [...waypoints.values()];
    },
    size() {
      return waypoints.size;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return { waypoints: [...waypoints.values()] };
    },
    restore(snapshot) {
      waypoints.clear();
      for (const waypoint of snapshot.waypoints) waypoints.set(waypoint.id, waypoint);
      notify();
    },
  };
}

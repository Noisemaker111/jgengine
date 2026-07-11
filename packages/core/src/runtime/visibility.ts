export type VisibilityId = string | number;

export interface VisibilityPoint {
  x: number;
  y: number;
  z?: number;
}

export interface VisibilityBounds {
  center: VisibilityPoint;
  radius: number;
}

export interface CameraVisibilityContext {
  id: VisibilityId;
  position: VisibilityPoint;
  /** Approximate visible radius in world units. Adapters may derive this from a frustum. */
  visibleRadius: number;
  /** Extra distance used to request assets before an object becomes visible. */
  preloadMargin?: number;
  /** Cameras such as editor thumbnails can opt out of influencing streaming. */
  influencesStreaming?: boolean;
}

export interface VisibilityOverrides {
  alwaysVisible?: boolean;
  neverUnload?: boolean;
  cullingDisabled?: boolean;
  streamingDisabled?: boolean;
  minRenderDistance?: number;
  maxRenderDistance?: number;
  preloadMargin?: number;
}

export interface VisibilityObject {
  id: VisibilityId;
  bounds: VisibilityBounds;
  overrides?: VisibilityOverrides;
}

export interface VisibilityDefaults {
  enabled: boolean;
  streamingEnabled: boolean;
  minRenderDistance: number;
  maxRenderDistance: number;
  preloadMargin: number;
  unloadGraceMs: number;
  hysteresis: number;
}

export const DEFAULT_VISIBILITY_SETTINGS: Readonly<VisibilityDefaults> = Object.freeze({
  enabled: true,
  streamingEnabled: true,
  minRenderDistance: 0,
  maxRenderDistance: Number.POSITIVE_INFINITY,
  preloadMargin: 24,
  unloadGraceMs: 5_000,
  hysteresis: 8,
});

export interface VisibilityDecision {
  render: boolean;
  load: boolean;
  unload: boolean;
  reason:
    | "always-visible"
    | "culling-disabled"
    | "visible"
    | "preload"
    | "distance-culled"
    | "outside-view"
    | "grace-period"
    | "streaming-disabled";
}

interface VisibilityState {
  loaded: boolean;
  lastNeededAt: number;
}

function squaredDistance(a: VisibilityPoint, b: VisibilityPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return dx * dx + dy * dy + dz * dz;
}

function intersectsRadius(
  camera: CameraVisibilityContext,
  bounds: VisibilityBounds,
  extraMargin: number,
): boolean {
  const radius = Math.max(0, camera.visibleRadius + extraMargin + bounds.radius);
  return squaredDistance(camera.position, bounds.center) <= radius * radius;
}

/**
 * Engine-level visibility and asset-residency policy.
 *
 * Render culling and asset streaming are intentionally separate. This class never
 * destroys entities or throttles simulation; adapters decide how to apply results.
 */
export class VisibilitySystem {
  readonly settings: VisibilityDefaults;
  readonly #states = new Map<VisibilityId, VisibilityState>();

  constructor(settings: Partial<VisibilityDefaults> = {}) {
    this.settings = { ...DEFAULT_VISIBILITY_SETTINGS, ...settings };
  }

  evaluate(
    object: VisibilityObject,
    cameras: readonly CameraVisibilityContext[],
    now = Date.now(),
  ): VisibilityDecision {
    const overrides = object.overrides ?? {};
    const state = this.#states.get(object.id) ?? { loaded: false, lastNeededAt: now };

    if (overrides.alwaysVisible) {
      this.#markNeeded(object.id, state, now);
      return { render: true, load: true, unload: false, reason: "always-visible" };
    }

    if (!this.settings.enabled || overrides.cullingDisabled) {
      this.#markNeeded(object.id, state, now);
      return { render: true, load: true, unload: false, reason: "culling-disabled" };
    }

    const minDistance = Math.max(0, overrides.minRenderDistance ?? this.settings.minRenderDistance);
    const maxDistance = Math.max(minDistance, overrides.maxRenderDistance ?? this.settings.maxRenderDistance);
    const minDistanceSq = minDistance * minDistance;
    const maxDistanceWithRadius = maxDistance + object.bounds.radius;
    const maxDistanceSq = maxDistanceWithRadius * maxDistanceWithRadius;

    let insideDistance = false;
    let visible = false;
    let preload = false;

    for (const camera of cameras) {
      const distanceSq = squaredDistance(camera.position, object.bounds.center);
      if (distanceSq < minDistanceSq || distanceSq > maxDistanceSq) continue;
      insideDistance = true;

      if (intersectsRadius(camera, object.bounds, this.settings.hysteresis)) {
        visible = true;
      }

      if (camera.influencesStreaming !== false) {
        const margin =
          overrides.preloadMargin ?? camera.preloadMargin ?? this.settings.preloadMargin;
        if (intersectsRadius(camera, object.bounds, margin + this.settings.hysteresis)) {
          preload = true;
        }
      }
    }

    if (visible) {
      this.#markNeeded(object.id, state, now);
      return { render: true, load: true, unload: false, reason: "visible" };
    }

    if (overrides.streamingDisabled || !this.settings.streamingEnabled) {
      state.loaded = true;
      this.#states.set(object.id, state);
      return {
        render: false,
        load: true,
        unload: false,
        reason: "streaming-disabled",
      };
    }

    if (preload) {
      this.#markNeeded(object.id, state, now);
      return { render: false, load: true, unload: false, reason: "preload" };
    }

    if (overrides.neverUnload) {
      state.loaded = true;
      this.#states.set(object.id, state);
      return {
        render: false,
        load: true,
        unload: false,
        reason: insideDistance ? "outside-view" : "distance-culled",
      };
    }

    const graceActive = state.loaded && now - state.lastNeededAt < this.settings.unloadGraceMs;
    if (graceActive) {
      this.#states.set(object.id, state);
      return { render: false, load: true, unload: false, reason: "grace-period" };
    }

    state.loaded = false;
    this.#states.set(object.id, state);
    return {
      render: false,
      load: false,
      unload: true,
      reason: insideDistance ? "outside-view" : "distance-culled",
    };
  }

  setLoaded(id: VisibilityId, loaded: boolean, now = Date.now()): void {
    const previous = this.#states.get(id);
    this.#states.set(id, {
      loaded,
      lastNeededAt: loaded ? now : previous?.lastNeededAt ?? now,
    });
  }

  forget(id: VisibilityId): void {
    this.#states.delete(id);
  }

  clear(): void {
    this.#states.clear();
  }

  #markNeeded(id: VisibilityId, state: VisibilityState, now: number): void {
    state.loaded = true;
    state.lastNeededAt = now;
    this.#states.set(id, state);
  }
}

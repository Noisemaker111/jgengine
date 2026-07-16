import type { EntityPosition } from "../scene/entityStore";

export interface FrustumCamera {
  position: EntityPosition;
  lookAt: EntityPosition;
  /** Vertical field of view in degrees. Default 55. */
  fovDeg?: number;
  /** Width / height. Default 16 / 9. */
  aspect?: number;
  near?: number;
  far?: number;
}

export interface FrustumTarget {
  id: string;
  position: EntityPosition;
  /** Subject radius in world units, used by the framing-size score. Default 0.5. */
  radius?: number;
}

export interface FrustumProjection {
  inView: boolean;
  distance: number;
  /** -1..1, 0 = screen center, negative = left/down. */
  screenX: number;
  screenY: number;
}

function subtract(a: EntityPosition, b: EntityPosition): EntityPosition {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(v: EntityPosition): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalize(v: EntityPosition): EntityPosition {
  const len = length(v);
  return len === 0 ? [0, 0, 0] : [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: EntityPosition, b: EntityPosition): EntityPosition {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: EntityPosition, b: EntityPosition): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

const WORLD_UP: EntityPosition = [0, 1, 0];

/**
 * Project a world point into the camera's view. Pure geometry — no three.js —
 * so a game can run "is this framed?" checks headlessly (photo-mode scoring,
 * server-side kill-cam validation) as well as from the live render camera.
  * @internal
  */
export function projectToView(camera: FrustumCamera, point: EntityPosition): FrustumProjection {
  const forward = normalize(subtract(camera.lookAt, camera.position));
  const relative = subtract(point, camera.position);
  const distance = length(relative);
  const depth = dot(relative, forward);

  const near = camera.near ?? 0.1;
  const far = camera.far ?? Number.POSITIVE_INFINITY;
  if (forward[0] === 0 && forward[1] === 0 && forward[2] === 0) {
    return { inView: false, distance, screenX: 0, screenY: 0 };
  }
  if (depth <= near || depth >= far) {
    return { inView: false, distance, screenX: 0, screenY: 0 };
  }

  let right = normalize(cross(forward, WORLD_UP));
  if (right[0] === 0 && right[1] === 0 && right[2] === 0) {
    right = normalize(cross(forward, [1, 0, 0]));
  }
  const up = cross(right, forward);

  const fovDeg = camera.fovDeg ?? 55;
  const aspect = camera.aspect ?? 16 / 9;
  const halfHeight = Math.tan((fovDeg * Math.PI) / 360);
  const halfWidth = halfHeight * aspect;

  const screenX = dot(relative, right) / (depth * halfWidth);
  const screenY = dot(relative, up) / (depth * halfHeight);
  const inView = Math.abs(screenX) <= 1 && Math.abs(screenY) <= 1;
  return { inView, distance, screenX, screenY };
}

export interface FramingConfig {
  /** World-unit distance from camera that reads as "ideally framed" size. Default 6. */
  idealDistance?: number;
  /** Weight of screen-center placement in the framing score. Default 0.6. */
  centerWeight?: number;
  /** Weight of subject size (distance-to-ideal) in the framing score. Default 0.4. */
  sizeWeight?: number;
}

/** 0 (not framed) .. 1 (dead-center, ideal distance) framing quality for an in-view projection.
 * @internal
 */
export function framingScore(projection: FrustumProjection, config?: FramingConfig): number {
  if (!projection.inView) return 0;
  const idealDistance = config?.idealDistance ?? 6;
  const centerWeight = config?.centerWeight ?? 0.6;
  const sizeWeight = config?.sizeWeight ?? 0.4;
  const radial = Math.min(1, Math.sqrt(projection.screenX * projection.screenX + projection.screenY * projection.screenY));
  const centerScore = 1 - radial;
  const sizeScore = idealDistance <= 0
    ? 0
    : Math.max(0, 1 - Math.abs(projection.distance - idealDistance) / idealDistance);
  return Math.max(0, Math.min(1, centerWeight * centerScore + sizeWeight * sizeScore));
}

export interface FrustumSample {
  id: string;
  inView: boolean;
  distance: number;
  screenX: number;
  screenY: number;
  framing: number;
  /** Seconds continuously in view, up to and including this tick; resets to 0 the instant the subject leaves view. */
  dwellSeconds: number;
}

export interface FrustumSensor {
  tick(camera: FrustumCamera, targets: readonly FrustumTarget[], dt: number): FrustumSample[];
  reset(id?: string): void;
}

/**
 * A view-frustum sensor on a held camera object: which entities are in frame,
 * how well framed they are, and how long they've stayed on-screen (photo-mode
 * "is this subject framed", Content Warning-style monster-filming scoring).
  * @internal
  */
export function createFrustumSensor(config?: FramingConfig): FrustumSensor {
  const dwell = new Map<string, number>();

  return {
    tick(camera, targets, dt) {
      const seen = new Set<string>();
      const samples: FrustumSample[] = [];
      for (const target of targets) {
        seen.add(target.id);
        const projection = projectToView(camera, target.position);
        const framing = framingScore(projection, config);
        const nextDwell = projection.inView ? (dwell.get(target.id) ?? 0) + dt : 0;
        dwell.set(target.id, nextDwell);
        samples.push({
          id: target.id,
          inView: projection.inView,
          distance: projection.distance,
          screenX: projection.screenX,
          screenY: projection.screenY,
          framing,
          dwellSeconds: nextDwell,
        });
      }
      for (const id of dwell.keys()) {
        if (!seen.has(id)) dwell.delete(id);
      }
      return samples;
    },
    reset(id) {
      if (id === undefined) dwell.clear();
      else dwell.delete(id);
    },
  };
}

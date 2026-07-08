import type { Aim } from "../scene/spatial";

export type PointerVec3 = readonly [number, number, number];

/**
 * Renderer-free result of a screen→world raycast. The shell's pointer service
 * produces this from the cursor; core-side gameplay (item.use aim, click-to-move,
 * ground-target abilities, pings) consumes it without touching three.js.
 */
export interface PointerHit {
  /** World-space point under the cursor (surface or ground plane). */
  point: PointerVec3;
  /** World-space surface normal at the hit; `[0, 1, 0]` for the ground plane. */
  normal: PointerVec3;
  /** Topmost scene-entity instance id under the cursor, or null over open ground. */
  entity: string | null;
  /** Topmost scene-object instance id under the cursor, or null. */
  object: string | null;
  /** Texture-space UV at the hit, when the intersected mesh carries UVs; absent for the ground-plane fallback. */
  uv?: { u: number; v: number };
  /** Sampled `#rrggbb` color + PBR params from the hit mesh's `MeshStandardMaterial` (#151.2); `null`/unset when the hit surface has no standard material (e.g. the ground plane). */
  material?: { color: string; metalness?: number; roughness?: number } | null;
  /** Index of the hit instance when the intersected mesh is a `THREE.InstancedMesh`; absent otherwise. */
  instanceId?: number;
}

export type PointerButton = "primary" | "secondary" | "middle";

/** Build an `origin → point` aim for `item.use` / projectiles, firing toward the cursor. */
export function aimToPoint(origin: PointerVec3, point: PointerVec3): Aim {
  const dx = point[0] - origin[0];
  const dy = point[1] - origin[1];
  const dz = point[2] - origin[2];
  const length = Math.hypot(dx, dy, dz);
  const direction: PointerVec3 = length < 1e-9 ? [0, 0, 1] : [dx / length, dy / length, dz / length];
  return { origin, direction };
}

/** The move-to target of a pointer hit — sugar over `hit.point`. */
export function moveTargetFromHit(hit: PointerHit): PointerVec3 {
  return hit.point;
}

/** Project a pointer hit onto the XZ plane for navmesh routing (`findPath` takes `[x, z]`). */
export function groundOf(hit: PointerHit): readonly [number, number] {
  return [hit.point[0], hit.point[2]];
}

/** Snapshot of an in-progress or just-released drag: origin/current cursor points plus the clamped pull vector. */
export interface DragState {
  origin: PointerVec3;
  current: PointerVec3;
  /** `current - origin`, clamped to `maxPull` in length. */
  pull: PointerVec3;
  /** Length of `pull`, at most `maxPull`. */
  magnitude: number;
  /** `magnitude / maxPull`, in `[0, 1]`. `0` when `maxPull` is unset. */
  fraction: number;
}

export type DragResult = DragState;

export interface DragCaptureConfig {
  /** Clamp on pull-vector length. Unset (default) means unclamped. */
  maxPull?: number;
  /** Max distance from `origin` a `begin()` point may be to start a drag. Unset (default) means unrestricted. */
  grabRadius?: number;
}

/** Renderer-agnostic drag-capture / pull-vector state machine for slingshot-style aiming, drawback abilities, and similar gestures. */
export interface DragCapture {
  /** Start a drag at `origin` if `at` is within `grabRadius` of it. Returns whether the drag started. */
  begin(origin: PointerVec3, at: PointerVec3): boolean;
  /** Move the drag's current point. No-op when no drag is active. */
  update(at: PointerVec3): void;
  /** End the drag, returning its final state, or `null` if no drag was active. */
  release(): DragResult | null;
  /** Abort the drag without producing a result. */
  cancel(): void;
  /** The current drag state, or `null` when idle. */
  state(): DragState | null;
}

function subtractVec3(a: PointerVec3, b: PointerVec3): PointerVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function lengthVec3(v: PointerVec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function createDragCapture(config: DragCaptureConfig = {}): DragCapture {
  const maxPull = config.maxPull ?? Number.POSITIVE_INFINITY;
  const grabRadius = config.grabRadius ?? Number.POSITIVE_INFINITY;
  let origin: PointerVec3 | null = null;
  let current: PointerVec3 | null = null;

  function snapshot(): DragState | null {
    if (origin === null || current === null) return null;
    const offset = subtractVec3(current, origin);
    const rawLength = lengthVec3(offset);
    const scale = rawLength > maxPull && rawLength > 0 ? maxPull / rawLength : 1;
    const pull: PointerVec3 = [offset[0] * scale, offset[1] * scale, offset[2] * scale];
    const magnitude = Math.min(rawLength, maxPull);
    const fraction = Number.isFinite(maxPull) && maxPull > 0 ? magnitude / maxPull : 0;
    return { origin, current, pull, magnitude, fraction };
  }

  return {
    begin(dragOrigin, at) {
      if (lengthVec3(subtractVec3(at, dragOrigin)) > grabRadius) return false;
      origin = dragOrigin;
      current = at;
      return true;
    },
    update(at) {
      if (origin === null) return;
      current = at;
    },
    release() {
      const result = snapshot();
      origin = null;
      current = null;
      return result;
    },
    cancel() {
      origin = null;
      current = null;
    },
    state: snapshot,
  };
}

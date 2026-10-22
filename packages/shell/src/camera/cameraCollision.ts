/**
 * Camera spring-arm occlusion filtering and camera clearance.
 *
 * The orbit rig raycasts target→camera each frame and pulls the boom in past
 * occluders. Author decor mounted through the `WorldOverlay` presentation seam
 * is dressing, not collision geometry, so it should never yank the camera. A
 * decor group flags itself camera-transparent once (`jgCameraTransparent`) and
 * every descendant inherits it — a child can opt back into blocking the camera
 * with `jgCameraCollide`.
 *
 * `clearCameraBoom` is the collision half every rig (and a game-owned camera)
 * shares: one query against the world's existing collision, one boom length that
 * cannot leave the camera inside geometry.
 */

import type { SceneRaycastApi } from "@jgengine/core/scene/sceneRaycast";

/** Minimal structural view of a raycast hit object: its own tags plus a parent link to walk. Keeps this filter free of a three.js import so it stays unit-testable. */
export interface CameraOccluder {
  readonly userData?: Record<string, unknown>;
  readonly parent?: CameraOccluder | null;
}

/** userData applied to the group wrapping author `WorldOverlay` decor so the spring-arm ignores it by default. */
export const CAMERA_TRANSPARENT_USERDATA: { readonly jgCameraTransparent: true } = {
  jgCameraTransparent: true,
};

/**
 * Should the camera spring-arm ignore this raycast hit? Walks the object up its
 * `.parent` chain and honors the nearest camera tag: `jgCameraCollide === true`
 * blocks (opt back in), `jgCameraTransparent === true` passes through. Untagged
 * geometry blocks as before, so engine-owned ground/entities are unaffected.
 *
 * @capability camera-transparent-decor let author decor pass through the orbit spring-arm; a child opts back in with jgCameraCollide
 */
export function isCameraOccluderTransparent(object: CameraOccluder | null | undefined): boolean {
  for (let node = object ?? null; node != null; node = node.parent ?? null) {
    const data = node.userData;
    if (data === undefined) continue;
    if (data.jgCameraCollide === true) return false;
    if (data.jgCameraTransparent === true) return true;
  }
  return false;
}

/** World-space point for camera boom math, matching the rigs' `Vec3`. */
export interface CameraPoint {
  x: number;
  y: number;
  z: number;
}

/** One collision question the camera asks: distance along a ray to the nearest surface that should stop it. */
export interface CameraCollisionQuery {
  /** Distance to the nearest blocking surface within `maxDistance`, or `null` when the ray is clear. A ray starting inside a surface reports `0`. */
  firstHit(origin: CameraPoint, direction: CameraPoint, maxDistance: number): number | null;
}

/** What a camera asks `clearCameraBoom` each frame: the boom it wants and the surfaces that may stop it. */
export interface CameraClearanceInput {
  /** Follow point the boom is anchored to: a shoulder, a chest, or a point behind a first-person eye. */
  pivot: CameraPoint;
  /** Where the rig wants the camera before collision. */
  desired: CameraPoint;
  query: CameraCollisionQuery;
  /** Gap kept between the camera and the surface it would enter; also the near-plane budget. Default 0.3. */
  clearance?: number;
  /** Previous frame's boom length. Omit for a direct answer with no release easing. */
  previousArm?: number | null;
  /** Frame time for the release ease; omit or `0` to snap. */
  deltaSeconds?: number;
  /** Per-second rate the boom grows back once the surface is gone. Default 8. */
  releaseRate?: number;
}

/** Clear camera position and the boom length to hand back next frame. */
export interface CameraClearanceResult {
  /** Clear camera position: `desired` unchanged when nothing blocks, pulled toward `pivot` otherwise. */
  position: CameraPoint;
  /** Boom length used; pass back as `previousArm` next frame. */
  arm: number;
  /** True when the desired position was rejected because collision sits on the boom. */
  pulled: boolean;
}

function clampNumber(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Pull a camera in along its boom so it never sits inside world collision.
 * A blocking surface rejects the desired position: the camera moves to
 * `clearance` before it, and onto the pivot when the surface is closer than that
 * (the pivot is inside, so no camera position is clear). Pulling in is immediate
 * — a camera must not spend a frame inside a trunk — while releasing eases back
 * at `releaseRate`, which is what makes the boom read as a spring arm instead of
 * a hard stop.
 *
 * @capability camera-clearance keep any camera out of world collision with a spring-arm pull-in
 */
export function clearCameraBoom(input: CameraClearanceInput): CameraClearanceResult {
  const { pivot, desired, query } = input;
  const dx = desired.x - pivot.x;
  const dy = desired.y - pivot.y;
  const dz = desired.z - pivot.z;
  const length = Math.hypot(dx, dy, dz);
  if (!(length > 1e-6) || !Number.isFinite(length)) {
    return { position: { ...desired }, arm: 0, pulled: false };
  }
  const clearance = Math.max(0, input.clearance ?? 0.3);
  const direction = { x: dx / length, y: dy / length, z: dz / length };
  const hit = query.firstHit(pivot, direction, length + clearance);
  const allowed = hit === null ? length : clampNumber(hit - clearance, 0, length);

  let arm = allowed;
  const previous = input.previousArm;
  const dt = input.deltaSeconds ?? 0;
  if (previous !== null && previous !== undefined && previous < allowed && dt > 0) {
    const rate = Math.max(0, input.releaseRate ?? 8);
    arm = Math.min(allowed, previous + (allowed - previous) * (1 - Math.exp(-rate * dt)));
  }
  return {
    position: { x: pivot.x + direction.x * arm, y: pivot.y + direction.y * arm, z: pivot.z + direction.z * arm },
    arm,
    pulled: hit !== null && arm < length - 1e-9,
  };
}

/**
 * `CameraCollisionQuery` over the scene's existing collision query (`ctx.scene.raycast`),
 * which already reads world solids, scene-object colliders and walls. Entities and
 * terrain stay out by default: the followed body must not push its own camera, and
 * looking down at the ground must not pull the boom.
 *
 * @capability camera-clearance keep any camera out of world collision with a spring-arm pull-in
 */
export function sceneCameraQuery(
  raycast: SceneRaycastApi["raycast"],
  options: { entities?: boolean; terrain?: boolean } = {},
): CameraCollisionQuery {
  const filter = { entities: options.entities ?? false, terrain: options.terrain ?? false };
  return {
    firstHit(origin, direction, maxDistance) {
      const hit = raycast({
        origin: [origin.x, origin.y, origin.z],
        direction: [direction.x, direction.y, direction.z],
        maxDistance,
        filter,
      });
      return hit === null ? null : hit.distance;
    },
  };
}

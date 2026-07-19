/**
 * Camera spring-arm occlusion filtering.
 *
 * The orbit rig raycasts target→camera each frame and pulls the boom in past
 * occluders. Author decor mounted through the `WorldOverlay` presentation seam
 * is dressing, not collision geometry, so it should never yank the camera. A
 * decor group flags itself camera-transparent once (`jgCameraTransparent`) and
 * every descendant inherits it — a child can opt back into blocking the camera
 * with `jgCameraCollide`.
 */

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

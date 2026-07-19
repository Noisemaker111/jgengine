import type * as THREE from "three";

/**
 * Spread onto a group's `userData` to mark its subtree as a screen/world overlay effect —
 * additive glows, telegraphs, tracers, debug gizmos — that post-processing scene prepasses
 * (GTAO's normal/depth render, DOF's depth render) must skip. Those prepasses render the
 * scene with `overrideMaterial`, which turns transparent overlay quads into opaque stamps
 * in the AO/DOF buffers (visible as black squares over hit sparks). The shell marks its own
 * combat VFX and collision-debug mounts; games mark custom overlay effects the same way.
 */
export const POSTFX_OVERLAY_USERDATA: { readonly jgPostfxOverlay: true } = {
  jgPostfxOverlay: true,
};

/** True when the object opted out of postfx scene prepasses via {@link POSTFX_OVERLAY_USERDATA}. */
export function isPostfxOverlay(object: { userData?: Record<string, unknown> }): boolean {
  return object.userData?.jgPostfxOverlay === true;
}

/**
 * Hide every currently visible marked object under `scene`, recording what was hidden into
 * `out` (cleared first, no allocation on the hot path) so {@link restorePostfxOverlays} can
 * undo exactly that set.
 */
export function hidePostfxOverlays(scene: THREE.Object3D, out: THREE.Object3D[]): void {
  out.length = 0;
  scene.traverse((object) => {
    if (object.visible && isPostfxOverlay(object)) {
      object.visible = false;
      out.push(object);
    }
  });
}

/** Restore visibility for the objects hidden by {@link hidePostfxOverlays} and clear the list. */
export function restorePostfxOverlays(hidden: THREE.Object3D[]): void {
  for (const object of hidden) object.visible = true;
  hidden.length = 0;
}

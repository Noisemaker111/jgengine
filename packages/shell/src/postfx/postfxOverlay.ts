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

/** Whether a normal-material prepass must leave `object` out: three's AO pass cannot describe these. */
function isUnmodelledDrawable(object: THREE.Object3D): boolean {
  const drawable = object as { isPoints?: boolean; isLine?: boolean; isLine2?: boolean };
  return drawable.isPoints === true || drawable.isLine === true || drawable.isLine2 === true;
}

/**
 * What one scene's prepasses hide, and the graph revision that answer describes. A scene graph
 * changes when a node attaches or detaches, so every watched node bumps `revision` from two
 * listeners; the scene is scanned when the revision moves, not once per pass per frame.
 */
interface PrepassTrack {
  revision: number;
  scanned: number;
  overlays: THREE.Object3D[];
  drawables: THREE.Object3D[];
  listeners: Map<THREE.Object3D, () => void>;
}

const tracks = new WeakMap<THREE.Object3D, PrepassTrack>();

function unwatchAll(track: PrepassTrack, node: THREE.Object3D): void {
  track.listeners.get(node)?.();
  track.listeners.delete(node);
  for (const child of node.children) unwatchAll(track, child);
}

function watch(track: PrepassTrack, node: THREE.Object3D): void {
  if (track.listeners.has(node)) return;
  const added = ({ child }: THREE.Object3DEventMap["childadded"]) => {
    track.revision += 1;
    watch(track, child);
  };
  const removed = ({ child }: THREE.Object3DEventMap["childremoved"]) => {
    track.revision += 1;
    unwatchAll(track, child);
  };
  node.addEventListener("childadded", added);
  node.addEventListener("childremoved", removed);
  track.listeners.set(node, () => {
    node.removeEventListener("childadded", added);
    node.removeEventListener("childremoved", removed);
  });
  for (const child of node.children) watch(track, child);
}

function trackFor(scene: THREE.Object3D): PrepassTrack {
  const existing = tracks.get(scene);
  if (existing !== undefined) return existing;
  const track: PrepassTrack = { revision: 0, scanned: -1, overlays: [], drawables: [], listeners: new Map() };
  tracks.set(scene, track);
  watch(track, scene);
  return track;
}

function rescan(scene: THREE.Object3D, track: PrepassTrack): void {
  track.overlays.length = 0;
  track.drawables.length = 0;
  scene.traverse((object) => {
    if (isPostfxOverlay(object)) track.overlays.push(object);
    else if (isUnmodelledDrawable(object)) track.drawables.push(object);
  });
  track.scanned = track.revision;
}

function hideAll(objects: readonly THREE.Object3D[], out: THREE.Object3D[]): void {
  for (const object of objects) {
    if (!object.visible) continue;
    object.visible = false;
    out.push(object);
  }
}

/**
 * Hide every currently visible object `scene`'s prepasses must skip, recording what was hidden into
 * `out` (cleared first, no allocation on the hot path) so {@link restorePostfxOverlays} can undo
 * exactly that set. `withUnmodelled` also hides points and lines, which three's GTAO pass excludes
 * from its normal buffer but a depth prepass keeps.
 *
 * The set is cached and rescanned only when the scene graph changes: walking the whole scene per
 * prepass cost 2.4 ms/frame in Drift Foundry and 0.6 ms/frame in Harbor Heat, and the graph changes
 * when something mounts, not between frames.
 */
export function hidePostfxOverlays(scene: THREE.Object3D, out: THREE.Object3D[], withUnmodelled = false): void {
  out.length = 0;
  const track = trackFor(scene);
  if (track.scanned !== track.revision) rescan(scene, track);
  hideAll(track.overlays, out);
  if (withUnmodelled) hideAll(track.drawables, out);
}

/** Restore visibility for the objects hidden by {@link hidePostfxOverlays} and clear the list. */
export function restorePostfxOverlays(hidden: THREE.Object3D[]): void {
  for (const object of hidden) object.visible = true;
  hidden.length = 0;
}

/**
 * Drop the cached set and its listeners for a scene that is going away, so a torn-down world does
 * not keep its node graph reachable through this module.
 */
export function releasePostfxOverlayTracking(scene: THREE.Object3D): void {
  const track = tracks.get(scene);
  if (track === undefined) return;
  tracks.delete(scene);
  for (const off of track.listeners.values()) off();
  track.listeners.clear();
  track.overlays.length = 0;
  track.drawables.length = 0;
}

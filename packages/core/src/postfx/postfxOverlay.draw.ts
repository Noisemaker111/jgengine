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

/**
 * True when the object opted out of postfx scene prepasses via {@link POSTFX_OVERLAY_USERDATA}.
 * @internal
 */
export function isPostfxOverlay(object: { userData?: Record<string, unknown> }): boolean {
  return object.userData?.["jgPostfxOverlay"] === true;
}

/** Whether a normal-material prepass must leave `object` out: three's AO pass cannot describe these. */
function isUnmodelledDrawable(object: THREE.Object3D): boolean {
  const drawable = object as { isPoints?: boolean; isLine?: boolean; isLine2?: boolean };
  return drawable.isPoints === true || drawable.isLine === true || drawable.isLine2 === true;
}

/** Whether one node, and with it its whole subtree, stays out of a scene prepass. @internal */
export type PrepassExclusion = (node: THREE.Object3D) => boolean;

/** A depth or AO prepass leaves out marked overlays. @internal */
export const excludesOverlays: PrepassExclusion = (node) => isPostfxOverlay(node);

/** The AO normal prepass also leaves out points and lines, which three's GTAO pass cannot describe. @internal */
export const excludesOverlaysAndUnmodelled: PrepassExclusion = (node) => isPostfxOverlay(node) || isUnmodelledDrawable(node);

/** The renderer surface {@link drawPrepassExcluding} reads: three's render lists, which `WebGLRenderer` exposes. @internal */
export interface PrepassListRenderer {
  renderLists: { get(scene: THREE.Object3D, renderCallDepth: number): PrepassRenderList };
}

/** What a prepass drops from three's render list for one scene render. @internal */
export interface PrepassRenderList {
  opaque: { object: THREE.Object3D }[];
  transmissive: { object: THREE.Object3D }[];
  transparent: { object: THREE.Object3D }[];
  finish(): void;
}

function excludedUnder(object: THREE.Object3D, excluded: PrepassExclusion): boolean {
  for (let node: THREE.Object3D | null = object; node !== null; node = node.parent) if (excluded(node)) return true;
  return false;
}

function dropExcluded(items: { object: THREE.Object3D }[], excluded: PrepassExclusion): void {
  let kept = 0;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined || excludedUnder(item.object, excluded)) continue;
    items[kept] = item;
    kept += 1;
  }
  items.length = kept;
}

/**
 * Draw a prepass of `scene` without what `excluded` matches, or anything under it. The prepass
 * keeps three's own walk of the scene and drops the excluded draws from the render list it built,
 * before it sorts or draws: the same draws, in the same order, as hiding those subtrees would leave.
 *
 * Hiding them meant finding them first. That cost a walk of the whole scene per prepass and a pair of
 * graph listeners on every node to know when to walk again; Scrap Signal's graph changes every frame,
 * so it walked 10,800 nodes twice a frame, and the listeners changed the shape of every object three's
 * own walks read. This looks only at the draws three already collected, and their ancestors.
 * @internal
 */
export function drawPrepassExcluding<T>(renderer: PrepassListRenderer, scene: THREE.Object3D, excluded: PrepassExclusion, render: () => T): T {
  const lists = renderer.renderLists;
  const get = lists.get;
  const patched: { list: PrepassRenderList; finish: () => void }[] = [];
  lists.get = (drawn, depth) => {
    const list = get.call(lists, drawn, depth);
    if (drawn !== scene || patched.some((entry) => entry.list === list)) return list;
    const finish = list.finish;
    patched.push({ list, finish });
    list.finish = () => {
      finish();
      dropExcluded(list.opaque, excluded);
      dropExcluded(list.transmissive, excluded);
      dropExcluded(list.transparent, excluded);
    };
    return list;
  };
  try {
    return render();
  } finally {
    lists.get = get;
    for (const { list, finish } of patched) list.finish = finish;
  }
}

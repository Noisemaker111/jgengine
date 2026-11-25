// @skill jgengine-world
import type { EditorMarker, EditorPath, EditorVolume } from "@jgengine/core/editor/types";

/**
 * The part of a scene document the small viewer draws: markers, volumes and paths. An
 * `EditorDocument` is one, and so is a plain object an app builds itself, so drawing needs no
 * decoder and no editor session.
 */
export interface SceneViewDocument {
  readonly markers?: readonly EditorMarker[];
  readonly volumes?: readonly EditorVolume[];
  readonly paths?: readonly EditorPath[];
}

/** One drawable object of a document, tagged with the collection it came from. */
export type SceneViewObject =
  | { readonly type: "marker"; readonly value: EditorMarker }
  | { readonly type: "volume"; readonly value: EditorVolume }
  | { readonly type: "path"; readonly value: EditorPath };

/** Every visible object of a document, keyed by id. A later duplicate id replaces an earlier one. */
export function sceneViewObjects(document: SceneViewDocument): Map<string, SceneViewObject> {
  const objects = new Map<string, SceneViewObject>();
  for (const value of document.markers ?? []) if (value.hidden !== true) objects.set(value.id, { type: "marker", value });
  for (const value of document.volumes ?? []) if (value.hidden !== true) objects.set(value.id, { type: "volume", value });
  for (const value of document.paths ?? []) if (value.hidden !== true) objects.set(value.id, { type: "path", value });
  return objects;
}

/**
 * What changed between two documents, by object: an object is unchanged when its value is the same
 * reference, which is what an immutable edit (an editor session, a reducer, a spread) produces.
 */
export interface SceneViewDiff {
  readonly added: readonly SceneViewObject[];
  readonly changed: readonly SceneViewObject[];
  readonly removed: readonly string[];
}

/** The objects to draw, redraw and drop going from `previous` to `next`. */
export function diffSceneView(previous: ReadonlyMap<string, SceneViewObject>, next: ReadonlyMap<string, SceneViewObject>): SceneViewDiff {
  const added: SceneViewObject[] = [];
  const changed: SceneViewObject[] = [];
  const removed: string[] = [];
  for (const [id, object] of next) {
    const before = previous.get(id);
    if (before === undefined) added.push(object);
    else if (before.value !== object.value || before.type !== object.type) changed.push(object);
  }
  for (const id of previous.keys()) if (!next.has(id)) removed.push(id);
  return { added, changed, removed };
}

/** The kinds a document uses, so a viewer loads only those kinds' drawing. */
export function sceneViewKinds(objects: Iterable<SceneViewObject>): Set<string> {
  const kinds = new Set<string>();
  for (const object of objects) kinds.add(object.value.kind);
  return kinds;
}

/** An axis-aligned box around points. Empty when `min.x > max.x`. */
export interface SceneViewBounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** The box around every object's extent, used to frame the camera on first draw. */
export function sceneViewBounds(objects: Iterable<SceneViewObject>): SceneViewBounds {
  const bounds: SceneViewBounds = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
  const grow = (x: number, y: number, z: number, r = 0) => {
    bounds.min.x = Math.min(bounds.min.x, x - r); bounds.min.y = Math.min(bounds.min.y, y - r); bounds.min.z = Math.min(bounds.min.z, z - r);
    bounds.max.x = Math.max(bounds.max.x, x + r); bounds.max.y = Math.max(bounds.max.y, y + r); bounds.max.z = Math.max(bounds.max.z, z + r);
  };
  for (const { type, value } of objects) {
    if (type === "marker") grow(value.position.x, value.position.y, value.position.z);
    else if (type === "path") for (const point of value.points) grow(point.x, point.y, point.z);
    else {
      const half = value.halfExtents;
      if (half !== undefined) {
        grow(value.center.x - half.x, value.center.y - half.y, value.center.z - half.z);
        grow(value.center.x + half.x, value.center.y + half.y, value.center.z + half.z);
      } else grow(value.center.x, value.center.y, value.center.z, Math.max(value.radius ?? 0.5, (value.height ?? 0) / 2));
    }
  }
  return bounds;
}

/**
 * An orbit camera: it looks at `target` from `distance` meters away, turned `yaw` radians around
 * the vertical axis and tilted `pitch` radians above the horizon.
 */
export interface SceneViewCamera {
  target: { x: number; y: number; z: number };
  distance: number;
  yaw: number;
  pitch: number;
}

const MIN_PITCH = -1.5;
const MAX_PITCH = 1.5;

/** A camera that frames `bounds` for a view `fovDegrees` tall at `aspect` (width / height), seen from `yaw`, `pitch`. */
export function frameSceneView(bounds: SceneViewBounds, fovDegrees = 45, aspect = 1, yaw = Math.PI / 4, pitch = 0.55): SceneViewCamera {
  if (bounds.min.x > bounds.max.x) return { target: { x: 0, y: 0, z: 0 }, distance: 10, yaw, pitch };
  const target = { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2, z: (bounds.min.z + bounds.max.z) / 2 };
  const tanY = Math.tan((fovDegrees * Math.PI) / 360);
  const tanX = tanY * aspect;
  const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  const up = { x: -Math.sin(pitch) * Math.sin(yaw), y: Math.cos(pitch), z: -Math.sin(pitch) * Math.cos(yaw) };
  const back = { x: Math.cos(pitch) * Math.sin(yaw), y: Math.sin(pitch), z: Math.cos(pitch) * Math.cos(yaw) };
  // The nearest eye distance that keeps every corner of the box inside the view.
  let distance = 0.5;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const offset = { x: x - target.x, y: y - target.y, z: z - target.z };
    const along = (axis: { x: number; y: number; z: number }) => offset.x * axis.x + offset.y * axis.y + offset.z * axis.z;
    distance = Math.max(distance, Math.abs(along(right)) / tanX + along(back), Math.abs(along(up)) / tanY + along(back));
  }
  return { target, distance: distance * 1.08, yaw, pitch };
}

/** The camera's eye position. */
export function sceneViewEye(camera: SceneViewCamera): { x: number; y: number; z: number } {
  const flat = Math.cos(camera.pitch) * camera.distance;
  return {
    x: camera.target.x + Math.sin(camera.yaw) * flat,
    y: camera.target.y + Math.sin(camera.pitch) * camera.distance,
    z: camera.target.z + Math.cos(camera.yaw) * flat,
  };
}

/** Turns the camera by a drag of `dx`, `dy` pixels on a view `height` pixels tall. */
export function orbitSceneView(camera: SceneViewCamera, dx: number, dy: number, height: number): SceneViewCamera {
  const perPixel = (Math.PI * 1.5) / Math.max(1, height);
  return { ...camera, yaw: camera.yaw - dx * perPixel, pitch: Math.min(MAX_PITCH, Math.max(MIN_PITCH, camera.pitch + dy * perPixel)) };
}

/** Moves the camera toward (`factor` < 1) or away from (`factor` > 1) its target. */
export function zoomSceneView(camera: SceneViewCamera, factor: number): SceneViewCamera {
  return { ...camera, distance: Math.min(1e5, Math.max(0.05, camera.distance * factor)) };
}

/** Slides the camera and its target by a drag of `dx`, `dy` pixels, keeping the dragged point under the finger. */
export function panSceneView(camera: SceneViewCamera, dx: number, dy: number, height: number, fovDegrees = 45): SceneViewCamera {
  const perPixel = (2 * camera.distance * Math.tan((fovDegrees * Math.PI) / 360)) / Math.max(1, height);
  const right = { x: Math.cos(camera.yaw), z: -Math.sin(camera.yaw) };
  const up = { x: -Math.sin(camera.pitch) * Math.sin(camera.yaw), y: Math.cos(camera.pitch), z: -Math.sin(camera.pitch) * Math.cos(camera.yaw) };
  return {
    ...camera,
    target: {
      x: camera.target.x - (dx * right.x - dy * up.x) * perPixel,
      y: camera.target.y + dy * up.y * perPixel,
      z: camera.target.z - (dx * right.z - dy * up.z) * perPixel,
    },
  };
}

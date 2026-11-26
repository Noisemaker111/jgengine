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

/** The radius a marker draws at when its `meta.size` is unset. */
export const MARKER_SIZE = 0.15;

/** The box around every object's extent, used to frame the camera on first draw. */
export function sceneViewBounds(objects: Iterable<SceneViewObject>): SceneViewBounds {
  const bounds: SceneViewBounds = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
  const grow = (x: number, y: number, z: number, r = 0) => {
    bounds.min.x = Math.min(bounds.min.x, x - r); bounds.min.y = Math.min(bounds.min.y, y - r); bounds.min.z = Math.min(bounds.min.z, z - r);
    bounds.max.x = Math.max(bounds.max.x, x + r); bounds.max.y = Math.max(bounds.max.y, y + r); bounds.max.z = Math.max(bounds.max.z, z + r);
  };
  for (const { type, value } of objects) {
    if (type === "marker") {
      const size = value.meta?.["size"];
      grow(value.position.x, value.position.y, value.position.z, typeof size === "number" ? size : MARKER_SIZE);
    }
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

/** A 3D point or offset. */
export interface SceneViewVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A lit triangle mesh part drawn by the small WebGL2 viewer, with no three.js dependency. */
export interface SceneViewMeshPart {
  readonly type: "mesh";
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices?: Uint16Array | Uint32Array;
  readonly color: string;
  readonly position?: SceneViewVec3;
  readonly rotationY?: number;
}

/** An unlit line or polyline part drawn by the small WebGL2 viewer. */
export interface SceneViewLinePart {
  readonly type: "lines" | "line-strip";
  readonly positions: Float32Array;
  readonly color: string;
  readonly position?: SceneViewVec3;
  readonly rotationY?: number;
}

/** One drawable GPU part inside a {@link SceneViewNode}. */
export type SceneViewPart = SceneViewMeshPart | SceneViewLinePart;

/** The drawn output for one document object: an optional group offset and one or more GPU parts. */
export interface SceneViewNode {
  readonly name?: string;
  readonly position?: SceneViewVec3;
  readonly rotationY?: number;
  readonly parts: readonly SceneViewPart[];
}

function srgbChannelToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Parses `#rgb` or `#rrggbb` into sRGB `[0..1]` channels, falling back to neutral grey. */
export function parseHexSrgb(hex: string): [number, number, number] {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  if (clean.length === 3) {
    const r = parseInt(clean[0]! + clean[0]!, 16);
    const g = parseInt(clean[1]! + clean[1]!, 16);
    const b = parseInt(clean[2]! + clean[2]!, 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r / 255, g / 255, b / 255];
  } else if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r / 255, g / 255, b / 255];
  }
  return [0.725, 0.706, 0.667];
}

/** Parses `#rgb` or `#rrggbb` into linear RGB `[0..1]` for lit shading. */
export function parseHexLinear(hex: string): [number, number, number] {
  const [r, g, b] = parseHexSrgb(hex);
  return [srgbChannelToLinear(r), srgbChannelToLinear(g), srgbChannelToLinear(b)];
}

/** Computes flat per-triangle unit normals for an unindexed triangle list (`9` floats per triangle). */
export function computeFlatNormals(positions: ArrayLike<number>): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const ax = positions[i]!, ay = positions[i + 1]!, az = positions[i + 2]!;
    const ux = positions[i + 3]! - ax, uy = positions[i + 4]! - ay, uz = positions[i + 5]! - az;
    const vx = positions[i + 6]! - ax, vy = positions[i + 7]! - ay, vz = positions[i + 8]! - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    normals[i] = nx; normals[i + 1] = ny; normals[i + 2] = nz;
    normals[i + 3] = nx; normals[i + 4] = ny; normals[i + 5] = nz;
    normals[i + 6] = nx; normals[i + 7] = ny; normals[i + 8] = nz;
  }
  return normals;
}

/**
 * Extracts boundary and sharp crease line segments from an unindexed triangle list, matching
 * `EdgesGeometry` for crisp architectural wireframes.
 */
export function computeMeshEdges(positions: ArrayLike<number>, thresholdDegrees = 1): Float32Array {
  const thresholdDot = Math.cos((thresholdDegrees * Math.PI) / 180);
  const quant = (v: number) => Math.round(v * 1e4);
  const vKey = (x: number, y: number, z: number) => `${quant(x)},${quant(y)},${quant(z)}`;
  interface Edge { ax: number; ay: number; az: number; bx: number; by: number; bz: number; nx: number; ny: number; nz: number; count: number; sharp: boolean }
  const edges = new Map<string, Edge>();
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const pts: [number, number, number][] = [
      [positions[i]!, positions[i + 1]!, positions[i + 2]!],
      [positions[i + 3]!, positions[i + 4]!, positions[i + 5]!],
      [positions[i + 6]!, positions[i + 7]!, positions[i + 8]!],
    ];
    const [p0, p1, p2] = pts as [[number, number, number], [number, number, number], [number, number, number]];
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len === 0) continue;
    nx /= len; ny /= len; nz /= len;
    for (let e = 0; e < 3; e++) {
      const a = pts[e]!;
      const b = pts[(e + 1) % 3]!;
      const ka = vKey(a[0], a[1], a[2]);
      const kb = vKey(b[0], b[1], b[2]);
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const existing = edges.get(key);
      if (existing === undefined) {
        edges.set(key, { ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], nx, ny, nz, count: 1, sharp: false });
      } else {
        existing.count += 1;
        if (existing.nx * nx + existing.ny * ny + existing.nz * nz <= thresholdDot) existing.sharp = true;
      }
    }
  }
  const out: number[] = [];
  for (const edge of edges.values()) {
    if (edge.count === 1 || edge.sharp) out.push(edge.ax, edge.ay, edge.az, edge.bx, edge.by, edge.bz);
  }
  return new Float32Array(out);
}

/** Indexed box mesh centered at the origin with outward face normals. */
export function buildBoxMesh(width: number, height: number, depth: number, color: string): SceneViewMeshPart {
  const x = width / 2, y = height / 2, z = depth / 2;
  const positions = new Float32Array([
    // +Z
    -x, -y, z, x, -y, z, x, y, z, -x, y, z,
    // -Z
    x, -y, -z, -x, -y, -z, -x, y, -z, x, y, -z,
    // +Y
    -x, y, z, x, y, z, x, y, -z, -x, y, -z,
    // -Y
    -x, -y, -z, x, -y, -z, x, -y, z, -x, -y, z,
    // +X
    x, -y, z, x, -y, -z, x, y, -z, x, y, z,
    // -X
    -x, -y, -z, -x, -y, z, -x, y, z, -x, y, -z,
  ]);
  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23,
  ]);
  return { type: "mesh", positions, normals, indices, color };
}

/** Indexed UV sphere mesh centered at the origin with smooth unit normals. */
export function buildSphereMesh(radius: number, color: string, widthSegments = 24, heightSegments = 16): SceneViewMeshPart {
  const cols = widthSegments + 1;
  const rows = heightSegments + 1;
  const positions = new Float32Array(cols * rows * 3);
  const normals = new Float32Array(cols * rows * 3);
  let p = 0;
  for (let iy = 0; iy < rows; iy++) {
    const phi = (iy / heightSegments) * Math.PI;
    const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
    for (let ix = 0; ix < cols; ix++) {
      const theta = (ix / widthSegments) * Math.PI * 2;
      const nx = -Math.cos(theta) * sinPhi;
      const ny = cosPhi;
      const nz = Math.sin(theta) * sinPhi;
      positions[p] = nx * radius; positions[p + 1] = ny * radius; positions[p + 2] = nz * radius;
      normals[p] = nx; normals[p + 1] = ny; normals[p + 2] = nz;
      p += 3;
    }
  }
  const indices: number[] = [];
  for (let iy = 0; iy < heightSegments; iy++) {
    for (let ix = 0; ix < widthSegments; ix++) {
      const a = iy * cols + ix;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (iy !== 0) indices.push(a, c, b);
      if (iy !== heightSegments - 1) indices.push(b, c, d);
    }
  }
  return { type: "mesh", positions, normals, indices: new Uint16Array(indices), color };
}

/** Indexed cylinder mesh centered at the origin with smooth sides and flat caps. */
export function buildCylinderMesh(radius: number, height: number, color: string, radialSegments = 24): SceneViewMeshPart {
  const half = height / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  // Side ring
  for (let i = 0; i <= radialSegments; i++) {
    const theta = (i / radialSegments) * Math.PI * 2;
    const nx = Math.sin(theta), nz = Math.cos(theta);
    positions.push(nx * radius, half, nz * radius, nx * radius, -half, nz * radius);
    normals.push(nx, 0, nz, nx, 0, nz);
  }
  for (let i = 0; i < radialSegments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  // Caps (+Y and -Y)
  for (const sign of [1, -1] as const) {
    const center = positions.length / 3;
    const y = sign * half;
    positions.push(0, y, 0);
    normals.push(0, sign, 0);
    for (let i = 0; i <= radialSegments; i++) {
      const theta = (i / radialSegments) * Math.PI * 2;
      positions.push(Math.sin(theta) * radius, y, Math.cos(theta) * radius);
      normals.push(0, sign, 0);
    }
    for (let i = 0; i < radialSegments; i++) {
      if (sign > 0) indices.push(center, center + 1 + i, center + 2 + i);
      else indices.push(center, center + 2 + i, center + 1 + i);
    }
  }
  return { type: "mesh", positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices), color };
}

/** Octahedron mesh centered at the origin with flat face normals. */
export function buildOctahedronMesh(radius: number, color: string): SceneViewMeshPart {
  const r = radius;
  const v: [number, number, number][] = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]];
  const faces = [0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 2, 0, 4, 3, 0, 1, 3, 4, 5, 3, 1, 0, 3, 5];
  const positions = new Float32Array(faces.length * 3);
  for (let i = 0; i < faces.length; i++) {
    const pt = v[faces[i]!]!;
    positions[i * 3] = pt[0]; positions[i * 3 + 1] = pt[1]; positions[i * 3 + 2] = pt[2];
  }
  return { type: "mesh", positions, normals: computeFlatNormals(positions), color };
}

/** Column-major perspective * lookAt matrix for a right-handed Y-up scene (OpenGL clip space). */
export function buildViewProjMatrix(
  eye: SceneViewVec3,
  target: SceneViewVec3,
  fovDegrees: number,
  aspect: number,
  near: number,
  far: number,
): Float32Array {
  let zx = eye.x - target.x, zy = eye.y - target.y, zz = eye.z - target.z;
  const zLen = Math.hypot(zx, zy, zz) || 1;
  zx /= zLen; zy /= zLen; zz /= zLen;
  // up = (0, 1, 0), right = normalize(cross(up, z))
  let xx = zz, xy = 0, xz = -zx;
  let xLen = Math.hypot(xx, xy, xz);
  if (xLen < 1e-6) { xx = 1; xy = 0; xz = 0; xLen = 1; }
  xx /= xLen; xz /= xLen;
  // true up = cross(z, right)
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const tx = -(xx * eye.x + xy * eye.y + xz * eye.z);
  const ty = -(yx * eye.x + yy * eye.y + yz * eye.z);
  const tz = -(zx * eye.x + zy * eye.y + zz * eye.z);

  const f = 1 / Math.tan((fovDegrees * Math.PI) / 360);
  const sx = f / Math.max(1e-6, aspect);
  const nf = 1 / (near - far);
  const a = (far + near) * nf;
  const b = 2 * far * near * nf;

  return new Float32Array([
    sx * xx, f * yx, a * zx, -zx,
    sx * xy, f * yy, a * zy, -zy,
    sx * xz, f * yz, a * zz, -zz,
    sx * tx, f * ty, a * tz + b, -tz,
  ]);
}

import type { Vec3, RenderBounds } from "./bounds";

/** 3D perspective camera (the default game camera). */
export interface PerspectiveView {
  readonly kind: "perspective";
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up?: Vec3;
  /** Vertical field of view in degrees. Default 55. */
  readonly fovDeg?: number;
  /** Width / height. Default 16 / 9. */
  readonly aspect?: number;
  readonly near?: number;
  readonly far?: number;
}

/** 2D / orthographic camera (top-down, side-scroller, minimap). */
export interface OrthographicView {
  readonly kind: "orthographic";
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up?: Vec3;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly near?: number;
  readonly far?: number;
}

export type CameraView = PerspectiveView | OrthographicView;

export interface Frustum {
  /** 6 inward-facing planes, packed [nx,ny,nz,d] × 6. A point p is inside plane i when nx·px+ny·py+nz·pz+d ≥ 0. */
  readonly planes: Float64Array;
  /** 8 world corners, packed xyz × [ntl,ntr,nbl,nbr,ftl,ftr,fbl,fbr]. */
  readonly corners: Float64Array;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

const WORLD_UP: Vec3 = [0, 1, 0];
const ALT_UP: Vec3 = [1, 0, 0];

export function createFrustum(): Frustum {
  return {
    planes: new Float64Array(24),
    corners: new Float64Array(24),
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 0,
    maxY: 0,
    maxZ: 0,
  };
}

function setCorner(corners: Float64Array, i: number, x: number, y: number, z: number): void {
  corners[i * 3] = x;
  corners[i * 3 + 1] = y;
  corners[i * 3 + 2] = z;
}

function planeFromCorners(
  planes: Float64Array,
  slot: number,
  corners: Float64Array,
  a: number,
  b: number,
  c: number,
  centroidX: number,
  centroidY: number,
  centroidZ: number,
): void {
  const ax = corners[a * 3]!, ay = corners[a * 3 + 1]!, az = corners[a * 3 + 2]!;
  const bx = corners[b * 3]!, by = corners[b * 3 + 1]!, bz = corners[b * 3 + 2]!;
  const cx = corners[c * 3]!, cy = corners[c * 3 + 1]!, cz = corners[c * 3 + 2]!;
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  let d = -(nx * ax + ny * ay + nz * az);
  // Orient inward: the centroid of all 8 corners is guaranteed interior.
  if (nx * centroidX + ny * centroidY + nz * centroidZ + d < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
    d = -d;
  }
  planes[slot * 4] = nx;
  planes[slot * 4 + 1] = ny;
  planes[slot * 4 + 2] = nz;
  planes[slot * 4 + 3] = d;
}

export function updateFrustum(out: Frustum, view: CameraView): Frustum {
  const { position, target } = view;
  let fx = target[0] - position[0];
  let fy = target[1] - position[1];
  let fz = target[2] - position[2];
  const fLen = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
  fx /= fLen;
  fy /= fLen;
  fz /= fLen;

  const up = view.up ?? WORLD_UP;
  let rx = fy * up[2] - fz * up[1];
  let ry = fz * up[0] - fx * up[2];
  let rz = fx * up[1] - fy * up[0];
  let rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (rLen < 1e-8) {
    rx = fy * ALT_UP[2] - fz * ALT_UP[1];
    ry = fz * ALT_UP[0] - fx * ALT_UP[2];
    rz = fx * ALT_UP[1] - fy * ALT_UP[0];
    rLen = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
  }
  rx /= rLen;
  ry /= rLen;
  rz /= rLen;

  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  const near = view.near ?? 0.1;
  const far = view.far ?? 1000;
  let halfHNear: number, halfWNear: number, halfHFar: number, halfWFar: number;
  if (view.kind === "perspective") {
    const fov = ((view.fovDeg ?? 55) * Math.PI) / 180;
    const aspect = view.aspect ?? 16 / 9;
    halfHNear = Math.tan(fov / 2) * near;
    halfWNear = halfHNear * aspect;
    halfHFar = Math.tan(fov / 2) * far;
    halfWFar = halfHFar * aspect;
  } else {
    halfHNear = view.halfHeight;
    halfWNear = view.halfWidth;
    halfHFar = view.halfHeight;
    halfWFar = view.halfWidth;
  }

  const corners = out.corners;
  const ncx = position[0] + fx * near, ncy = position[1] + fy * near, ncz = position[2] + fz * near;
  const fcx = position[0] + fx * far, fcy = position[1] + fy * far, fcz = position[2] + fz * far;
  // [ntl,ntr,nbl,nbr,ftl,ftr,fbl,fbr]
  setCorner(corners, 0, ncx + ux * halfHNear - rx * halfWNear, ncy + uy * halfHNear - ry * halfWNear, ncz + uz * halfHNear - rz * halfWNear);
  setCorner(corners, 1, ncx + ux * halfHNear + rx * halfWNear, ncy + uy * halfHNear + ry * halfWNear, ncz + uz * halfHNear + rz * halfWNear);
  setCorner(corners, 2, ncx - ux * halfHNear - rx * halfWNear, ncy - uy * halfHNear - ry * halfWNear, ncz - uz * halfHNear - rz * halfWNear);
  setCorner(corners, 3, ncx - ux * halfHNear + rx * halfWNear, ncy - uy * halfHNear + ry * halfWNear, ncz - uz * halfHNear + rz * halfWNear);
  setCorner(corners, 4, fcx + ux * halfHFar - rx * halfWFar, fcy + uy * halfHFar - ry * halfWFar, fcz + uz * halfHFar - rz * halfWFar);
  setCorner(corners, 5, fcx + ux * halfHFar + rx * halfWFar, fcy + uy * halfHFar + ry * halfWFar, fcz + uz * halfHFar + rz * halfWFar);
  setCorner(corners, 6, fcx - ux * halfHFar - rx * halfWFar, fcy - uy * halfHFar - ry * halfWFar, fcz - uz * halfHFar - rz * halfWFar);
  setCorner(corners, 7, fcx - ux * halfHFar + rx * halfWFar, fcy - uy * halfHFar + ry * halfWFar, fcz - uz * halfHFar + rz * halfWFar);

  let cX = 0, cY = 0, cZ = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < 8; i += 1) {
    const x = corners[i * 3]!, y = corners[i * 3 + 1]!, z = corners[i * 3 + 2]!;
    cX += x; cY += y; cZ += z;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  cX /= 8; cY /= 8; cZ /= 8;
  out.minX = minX; out.minY = minY; out.minZ = minZ;
  out.maxX = maxX; out.maxY = maxY; out.maxZ = maxZ;

  const planes = out.planes;
  planeFromCorners(planes, 0, corners, 0, 1, 2, cX, cY, cZ); // near
  planeFromCorners(planes, 1, corners, 4, 6, 5, cX, cY, cZ); // far
  planeFromCorners(planes, 2, corners, 0, 2, 4, cX, cY, cZ); // left
  planeFromCorners(planes, 3, corners, 1, 5, 3, cX, cY, cZ); // right
  planeFromCorners(planes, 4, corners, 0, 4, 1, cX, cY, cZ); // top
  planeFromCorners(planes, 5, corners, 2, 3, 6, cX, cY, cZ); // bottom
  return out;
}

/** Conservative AABB-vs-frustum: never a false negative (may keep a corner-case that is truly outside). */
export function aabbInFrustum(
  f: Frustum,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): boolean {
  const planes = f.planes;
  for (let i = 0; i < 6; i += 1) {
    const nx = planes[i * 4]!, ny = planes[i * 4 + 1]!, nz = planes[i * 4 + 2]!, d = planes[i * 4 + 3]!;
    const px = nx >= 0 ? maxX : minX;
    const py = ny >= 0 ? maxY : minY;
    const pz = nz >= 0 ? maxZ : minZ;
    if (nx * px + ny * py + nz * pz + d < 0) return false;
  }
  return true;
}

export function sphereInFrustum(f: Frustum, cx: number, cy: number, cz: number, radius: number): boolean {
  const planes = f.planes;
  for (let i = 0; i < 6; i += 1) {
    const nx = planes[i * 4]!, ny = planes[i * 4 + 1]!, nz = planes[i * 4 + 2]!, d = planes[i * 4 + 3]!;
    if (nx * cx + ny * cy + nz * cz + d < -radius) return false;
  }
  return true;
}

/** Sphere broad-phase reject, then the tight AABB test. Both conservative. */
export function boundsInFrustum(f: Frustum, b: RenderBounds): boolean {
  if (!sphereInFrustum(f, b.centerX, b.centerY, b.centerZ, b.radius)) return false;
  return aabbInFrustum(f, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
}

/** Push every plane outward by `margin` (unit normals ⇒ d += margin) to form a preload/hysteresis region. */
export function dilateFrustum(src: Frustum, margin: number, out: Frustum): Frustum {
  const sp = src.planes;
  const op = out.planes;
  for (let i = 0; i < 6; i += 1) {
    op[i * 4] = sp[i * 4]!;
    op[i * 4 + 1] = sp[i * 4 + 1]!;
    op[i * 4 + 2] = sp[i * 4 + 2]!;
    op[i * 4 + 3] = sp[i * 4 + 3]! + margin;
  }
  out.corners.set(src.corners);
  out.minX = src.minX - margin;
  out.minY = src.minY - margin;
  out.minZ = src.minZ - margin;
  out.maxX = src.maxX + margin;
  out.maxY = src.maxY + margin;
  out.maxZ = src.maxZ + margin;
  return out;
}

import * as THREE from "three";

/** XZ rectangle in world units — matches the shape of a terraform snapshot's `bounds`. */
export interface HeightfieldRect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Per-vertex color hook for {@link displaceHeightfieldGeometry}; write the tone into `out`. */
export type HeightfieldColorFn = (x: number, z: number, height: number, out: THREE.Color) => void;

/** Options for {@link displaceHeightfieldGeometry}. */
export interface HeightfieldDisplaceOptions {
  /** World-space rect the plane spans (the plane is centered on it, XZ, +Y up). */
  bounds: HeightfieldRect;
  /**
   * Dirty world-space region to re-sample; only the vertex window covering it (plus a one-vertex
   * normal ring) updates. Omit or pass null for a full rebuild.
   */
  region?: HeightfieldRect | null;
  /** When given, writes a `color` attribute (creating it on demand) via this per-vertex hook. */
  color?: HeightfieldColorFn;
}

interface HeightfieldExtent {
  minY: number;
  maxY: number;
}

const EXTENT_KEY = "jgHeightfieldExtent";

/**
 * Re-samples a `PlaneGeometry(width, depth, segments, segments).rotateX(-π/2)` heightfield mesh
 * from a `sampleHeight` field in place: vertex Y, optional vertex color, grid central-difference
 * normals, and an analytically maintained bounding sphere. With a dirty `region`, the work is
 * O(region vertices) — heights/colors update inside the covering vertex window, normals inside the
 * window plus a one-vertex ring — never a whole-mesh `computeVertexNormals`/`computeBoundingSphere`
 * pass, which is what keeps per-frame brush stamps inside the editor's frame budget. The bounding
 * sphere derives from the fixed plane extents plus a running height range kept on
 * `geometry.userData`; partial passes only expand it, a full pass resets it exactly.
 * @capability heightfield-mesh-update in-place partial update of a displaced ground plane mesh
 */
export function displaceHeightfieldGeometry(
  geometry: THREE.BufferGeometry,
  sampleHeight: (x: number, z: number) => number,
  options: HeightfieldDisplaceOptions,
): void {
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const normals = geometry.attributes.normal as THREE.BufferAttribute;
  const { bounds } = options;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const depth = Math.max(1, bounds.maxZ - bounds.minZ);
  // PlaneGeometry(w, d, s, s) rotated -π/2 about X is a (s+1)² row-major grid: x fastest ascending,
  // z ascending per row (verified by heightfieldGeometry.test.ts against the three.js constructor).
  const side = Math.round(Math.sqrt(position.count));
  const segments = Math.max(1, side - 1);
  const stepX = width / segments;
  const stepZ = depth / segments;

  let colors = geometry.attributes.color as THREE.BufferAttribute | undefined;
  const wantColors = options.color !== undefined;
  const colorsMissing = wantColors && (colors === undefined || colors.count !== position.count);
  const region = options.region ?? null;
  const full = region === null || colorsMissing;
  if (colorsMissing) {
    colors = new THREE.BufferAttribute(new Float32Array(position.count * 3), 3);
    geometry.setAttribute("color", colors);
  }

  const clampCell = (value: number): number => (value < 0 ? 0 : value > segments ? segments : value);
  const col0 = full ? 0 : clampCell(Math.floor(((region!.minX - bounds.minX) / width) * segments));
  const col1 = full ? segments : clampCell(Math.ceil(((region!.maxX - bounds.minX) / width) * segments));
  const row0 = full ? 0 : clampCell(Math.floor(((region!.minZ - bounds.minZ) / depth) * segments));
  const row1 = full ? segments : clampCell(Math.ceil(((region!.maxZ - bounds.minZ) / depth) * segments));

  const tone = new THREE.Color();
  let windowMin = Infinity;
  let windowMax = -Infinity;
  for (let row = row0; row <= row1; row += 1) {
    const base = row * side;
    for (let col = col0; col <= col1; col += 1) {
      const index = base + col;
      const x = position.getX(index) + cx;
      const z = position.getZ(index) + cz;
      const height = sampleHeight(x, z);
      position.setY(index, height);
      if (height < windowMin) windowMin = height;
      if (height > windowMax) windowMax = height;
      if (options.color !== undefined) {
        options.color(x, z, height, tone);
        colors!.setXYZ(index, tone.r, tone.g, tone.b);
      }
    }
  }

  // Grid central-difference normals over the window plus a one-vertex ring — a height change moves
  // its neighbors' normals too. Matches smooth shading without a whole-mesh triangle pass.
  const nc0 = Math.max(0, col0 - 1);
  const nc1 = Math.min(segments, col1 + 1);
  const nr0 = Math.max(0, row0 - 1);
  const nr1 = Math.min(segments, row1 + 1);
  for (let row = nr0; row <= nr1; row += 1) {
    const rowD = Math.max(0, row - 1);
    const rowU = Math.min(segments, row + 1);
    for (let col = nc0; col <= nc1; col += 1) {
      const colL = Math.max(0, col - 1);
      const colR = Math.min(segments, col + 1);
      const hL = position.getY(row * side + colL);
      const hR = position.getY(row * side + colR);
      const hD = position.getY(rowD * side + col);
      const hU = position.getY(rowU * side + col);
      const nx = -(hR - hL) / Math.max(1e-6, (colR - colL) * stepX);
      const nz = -(hU - hD) / Math.max(1e-6, (rowU - rowD) * stepZ);
      const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
      normals.setXYZ(row * side + col, nx * inv, inv, nz * inv);
    }
  }

  const extent = (geometry.userData[EXTENT_KEY] as HeightfieldExtent | undefined) ?? {
    minY: Infinity,
    maxY: -Infinity,
  };
  if (full) {
    extent.minY = windowMin;
    extent.maxY = windowMax;
  } else {
    extent.minY = Math.min(extent.minY, windowMin);
    extent.maxY = Math.max(extent.maxY, windowMax);
  }
  geometry.userData[EXTENT_KEY] = extent;
  const hasExtent = extent.minY <= extent.maxY;
  const midY = hasExtent ? (extent.minY + extent.maxY) / 2 : 0;
  const halfY = hasExtent ? (extent.maxY - extent.minY) / 2 : 0;
  if (geometry.boundingSphere === null) geometry.boundingSphere = new THREE.Sphere();
  geometry.boundingSphere.center.set(0, midY, 0);
  geometry.boundingSphere.radius = Math.sqrt((width / 2) ** 2 + (depth / 2) ** 2 + halfY ** 2);

  position.needsUpdate = true;
  if (colors !== undefined && wantColors) colors.needsUpdate = true;
  normals.needsUpdate = true;
}

import type { EntityPosition } from "./entityStore";

/**
 * Compact, serializable triangle collision mesh measured at asset reindex — the renderer-free source
 * of mesh-accurate hitboxes. Positions are welded onto a 16-bit grid spanning `min`..`max` (model
 * space) and stored base64-encoded, so an opted-in catalog asset ships its collision triangles inside
 * the generated index without the runtime ever touching the rendered scene graph.
 */
export interface CollisionMeshData {
  /** Model-space bounds of the encoded vertices — the quantization frame. */
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  /** Welded vertex count; `positions` holds exactly `vertexCount * 3` u16 values. */
  vertexCount: number;
  /** Triangle count; `indices` holds exactly `triangleCount * 3` values. */
  triangleCount: number;
  /** Base64 little-endian u16 xyz triples, each axis normalized 0..65535 across `min`..`max`. */
  positions: string;
  /** Base64 little-endian triangle vertex indices — u16, or u32 when `vertexCount` exceeds 65536. */
  indices: string;
  /**
   * Coarse compound-box decomposition of the same triangles (voxel occupancy at capsule resolution,
   * greedy-merged): the walk-collision counterpart to the exact triangles, so movement passes through
   * an archway opening instead of colliding with one solid bounding box. Absent in indexes generated
   * before it was computed — consumers fall back to the single fitted box.
   */
  boxes?: readonly CollisionMeshBox[];
}

/** Raw triangle soup for {@link encodeCollisionMesh}: model-space xyz triples plus triangle indices. */
export interface CollisionMeshSource {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}

/** Model-space axis-aligned box as `[minX, minY, minZ, maxX, maxY, maxZ]`. */
export type CollisionMeshBox = readonly [number, number, number, number, number, number];

/**
 * Decoded, BVH-indexed triangles ready for per-ray queries — build once per asset via
 * {@link prepareCollisionMesh}. Treat the fields as opaque; they exist so the raycast hot path can
 * run allocation-free over flat arrays.
 */
export interface PreparedCollisionMesh {
  /** Dequantized model-space vertex xyz triples. */
  readonly positions: Float32Array;
  /** Triangle vertex indices, 3 per triangle. */
  readonly indices: Uint32Array;
  /** Per-node AABBs, 6 floats (minXYZ, maxXYZ) per node. */
  readonly nodeBounds: Float32Array;
  /** Leaf: first slot in `triOrder`. Internal: right-child node index (left child is `node + 1`). */
  readonly nodeStart: Int32Array;
  /** Leaf: triangle count (> 0). Internal: 0. */
  readonly nodeCount: Int32Array;
  /** Triangle indices grouped by leaf ranges. */
  readonly triOrder: Uint32Array;
}

/** Nearest triangle impact from {@link raycastCollisionMesh}: world distance along the ray and the world-space geometric normal facing the ray. */
export interface CollisionMeshHit {
  distance: number;
  normal: EntityPosition;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_INDEX = new Int8Array(128).fill(-1);
for (let i = 0; i < BASE64.length; i += 1) BASE64_INDEX[BASE64.charCodeAt(i)] = i;

function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const chunk = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += BASE64[(chunk >> 18) & 63]! + BASE64[(chunk >> 12) & 63]! + BASE64[(chunk >> 6) & 63]! + BASE64[chunk & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const chunk = bytes[i]! << 16;
    out += BASE64[(chunk >> 18) & 63]! + BASE64[(chunk >> 12) & 63]! + "==";
  } else if (rest === 2) {
    const chunk = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += BASE64[(chunk >> 18) & 63]! + BASE64[(chunk >> 12) & 63]! + BASE64[(chunk >> 6) & 63]! + "=";
  }
  return out;
}

function base64ToBytes(text: string): Uint8Array | null {
  let length = text.length;
  while (length > 0 && text[length - 1] === "=") length -= 1;
  if (text.length % 4 !== 0 && text.length - length !== 0) return null;
  const byteLength = Math.floor((length * 3) / 4);
  const out = new Uint8Array(byteLength);
  let outIndex = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < length; i += 1) {
    const code = text.charCodeAt(i);
    const value = code < 128 ? BASE64_INDEX[code]! : -1;
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIndex] = (buffer >> bits) & 0xff;
      outIndex += 1;
    }
  }
  if (outIndex !== byteLength) return null;
  return out;
}

/**
 * Quantize a triangle soup onto the 16-bit grid, weld coincident vertices, and drop triangles that
 * collapse — the reindex-time compressor producing {@link CollisionMeshData}. Returns `null` when no
 * finite, non-degenerate triangle survives.
 */
export function encodeCollisionMesh(source: CollisionMeshSource): CollisionMeshData | null {
  const positions = source.positions;
  const indices = source.indices;
  if (positions.length < 9 || positions.length % 3 !== 0) return null;
  if (indices.length < 3 || indices.length % 3 !== 0) return null;
  const sourceVertexCount = positions.length / 3;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const referenced = new Uint8Array(sourceVertexCount);
  for (let i = 0; i < indices.length; i += 1) {
    const index = indices[i]!;
    if (!Number.isInteger(index) || index < 0 || index >= sourceVertexCount) continue;
    referenced[index] = 1;
  }
  for (let v = 0; v < sourceVertexCount; v += 1) {
    if (referenced[v] === 0) continue;
    const x = positions[v * 3]!;
    const y = positions[v * 3 + 1]!;
    const z = positions[v * 3 + 2]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      referenced[v] = 0;
      continue;
    }
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;
  const quantized = new Int32Array(sourceVertexCount).fill(-1);
  const welded = new Map<number, number>();
  const weldedQuantized: number[] = [];
  for (let v = 0; v < sourceVertexCount; v += 1) {
    if (referenced[v] === 0) continue;
    const qx = spanX > 0 ? Math.round(((positions[v * 3]! - minX) / spanX) * 65535) : 0;
    const qy = spanY > 0 ? Math.round(((positions[v * 3 + 1]! - minY) / spanY) * 65535) : 0;
    const qz = spanZ > 0 ? Math.round(((positions[v * 3 + 2]! - minZ) / spanZ) * 65535) : 0;
    const key = qx + qy * 65536 + qz * 4294967296;
    let weldedIndex = welded.get(key);
    if (weldedIndex === undefined) {
      weldedIndex = weldedQuantized.length / 3;
      welded.set(key, weldedIndex);
      weldedQuantized.push(qx, qy, qz);
    }
    quantized[v] = weldedIndex;
  }

  const triangles: number[] = [];
  const sourceTriangles: number[] = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = quantized[indices[t]!] ?? -1;
    const b = quantized[indices[t + 1]!] ?? -1;
    const c = quantized[indices[t + 2]!] ?? -1;
    if (a < 0 || b < 0 || c < 0) continue;
    if (a === b || b === c || a === c) continue;
    triangles.push(a, b, c);
    sourceTriangles.push(indices[t]!, indices[t + 1]!, indices[t + 2]!);
  }
  if (triangles.length === 0) return null;

  const vertexCount = weldedQuantized.length / 3;
  const positionBytes = new Uint8Array(vertexCount * 6);
  const positionView = new DataView(positionBytes.buffer);
  for (let i = 0; i < weldedQuantized.length; i += 1) {
    positionView.setUint16(i * 2, weldedQuantized[i]!, true);
  }
  const wide = vertexCount > 65536;
  const indexBytes = new Uint8Array(triangles.length * (wide ? 4 : 2));
  const indexView = new DataView(indexBytes.buffer);
  for (let i = 0; i < triangles.length; i += 1) {
    if (wide) indexView.setUint32(i * 4, triangles[i]!, true);
    else indexView.setUint16(i * 2, triangles[i]!, true);
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    vertexCount,
    triangleCount: triangles.length / 3,
    positions: bytesToBase64(positionBytes),
    indices: bytesToBase64(indexBytes),
    boxes: decomposeBoxes(positions, sourceTriangles, minX, minY, minZ, maxX, maxY, maxZ, BOX_MAX_CELLS_PER_AXIS),
  };
}

// Compound-box decomposition targets capsule-scale walk collision, not bullet accuracy: cells near
// 0.25 model units keep an archway opening open while a handful of merged boxes cover the solid parts.
const BOX_TARGET_CELL = 0.25;
const BOX_MAX_CELLS_PER_AXIS = 32;
const BOX_MAX_COUNT = 48;
const BOX_MAX_SAMPLES_PER_EDGE = 96;
// Guards ceil() against float-fuzzy measured bounds (4.0000002 → 17 cells instead of 16).
const BOX_CELL_EPSILON = 1e-6;

function roundCoord(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Voxelize the triangle surfaces over the mesh bounds and greedy-merge occupied cells into a small
 * set of model-space boxes. Occupancy is conservative (any surface sample marks its cell), so
 * openings only ever shrink, never leak. Falls back to one full-bounds box when the shape resists
 * decomposition within the box cap.
 */
function decomposeBoxes(
  positions: ArrayLike<number>,
  sourceTriangles: readonly number[],
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  cellsPerAxisCap: number,
): CollisionMeshBox[] {
  const extentX = maxX - minX;
  const extentY = maxY - minY;
  const extentZ = maxZ - minZ;
  const nx = Math.max(1, Math.min(cellsPerAxisCap, Math.ceil(extentX / BOX_TARGET_CELL - BOX_CELL_EPSILON)));
  const ny = Math.max(1, Math.min(cellsPerAxisCap, Math.ceil(extentY / BOX_TARGET_CELL - BOX_CELL_EPSILON)));
  const nz = Math.max(1, Math.min(cellsPerAxisCap, Math.ceil(extentZ / BOX_TARGET_CELL - BOX_CELL_EPSILON)));
  const cellX = extentX / nx;
  const cellY = extentY / ny;
  const cellZ = extentZ / nz;
  let minCell = Infinity;
  for (const cell of [cellX, cellY, cellZ]) {
    if (cell > 0 && cell < minCell) minCell = cell;
  }
  if (!Number.isFinite(minCell)) {
    return [[roundCoord(minX), roundCoord(minY), roundCoord(minZ), roundCoord(maxX), roundCoord(maxY), roundCoord(maxZ)]];
  }

  const occupied = new Uint8Array(nx * ny * nz);
  const cellOf = (value: number, min: number, cell: number, count: number): number => {
    if (cell <= 0) return 0;
    const index = Math.floor((value - min) / cell);
    return index < 0 ? 0 : index >= count ? count - 1 : index;
  };
  for (let t = 0; t + 2 < sourceTriangles.length; t += 3) {
    const a = sourceTriangles[t]! * 3;
    const b = sourceTriangles[t + 1]! * 3;
    const c = sourceTriangles[t + 2]! * 3;
    const ax = positions[a]!;
    const ay = positions[a + 1]!;
    const az = positions[a + 2]!;
    const ux = positions[b]! - ax;
    const uy = positions[b + 1]! - ay;
    const uz = positions[b + 2]! - az;
    const vx = positions[c]! - ax;
    const vy = positions[c + 1]! - ay;
    const vz = positions[c + 2]! - az;
    const longest = Math.max(
      Math.hypot(ux, uy, uz),
      Math.hypot(vx, vy, vz),
      Math.hypot(vx - ux, vy - uy, vz - uz),
    );
    const steps = Math.max(1, Math.min(BOX_MAX_SAMPLES_PER_EDGE, Math.ceil(longest / (minCell / 2))));
    for (let i = 0; i <= steps; i += 1) {
      for (let j = 0; j <= steps - i; j += 1) {
        const u = i / steps;
        const v = j / steps;
        const px = ax + ux * u + vx * v;
        const py = ay + uy * u + vy * v;
        const pz = az + uz * u + vz * v;
        const cx = cellOf(px, minX, cellX, nx);
        const cy = cellOf(py, minY, cellY, ny);
        const cz = cellOf(pz, minZ, cellZ, nz);
        occupied[cx + cy * nx + cz * nx * ny] = 1;
      }
    }
  }

  const claimed = new Uint8Array(nx * ny * nz);
  const growable = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): boolean => {
    for (let z = z0; z <= z1; z += 1) {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const index = x + y * nx + z * nx * ny;
          if (occupied[index] === 0 || claimed[index] === 1) return false;
        }
      }
    }
    return true;
  };
  const boxes: CollisionMeshBox[] = [];
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const index = x + y * nx + z * nx * ny;
        if (occupied[index] === 0 || claimed[index] === 1) continue;
        let x1 = x;
        while (x1 + 1 < nx && growable(x1 + 1, x1 + 1, y, y, z, z)) x1 += 1;
        let y1 = y;
        while (y1 + 1 < ny && growable(x, x1, y1 + 1, y1 + 1, z, z)) y1 += 1;
        let z1 = z;
        while (z1 + 1 < nz && growable(x, x1, y, y1, z1 + 1, z1 + 1)) z1 += 1;
        for (let cz = z; cz <= z1; cz += 1) {
          for (let cy = y; cy <= y1; cy += 1) {
            for (let cx = x; cx <= x1; cx += 1) {
              claimed[cx + cy * nx + cz * nx * ny] = 1;
            }
          }
        }
        boxes.push([
          roundCoord(minX + x * cellX),
          roundCoord(minY + y * cellY),
          roundCoord(minZ + z * cellZ),
          roundCoord(minX + (x1 + 1) * cellX),
          roundCoord(minY + (y1 + 1) * cellY),
          roundCoord(minZ + (z1 + 1) * cellZ),
        ]);
      }
    }
  }
  if (boxes.length > BOX_MAX_COUNT) {
    // Halve the effective resolution (not the unused cap headroom) so each retry genuinely coarsens;
    // shapes that stay fragmented even at 4 cells per axis collapse to the plain bounds box.
    const used = Math.max(nx, ny, nz);
    if (used > 4) {
      return decomposeBoxes(positions, sourceTriangles, minX, minY, minZ, maxX, maxY, maxZ, used >> 1);
    }
    return [[roundCoord(minX), roundCoord(minY), roundCoord(minZ), roundCoord(maxX), roundCoord(maxY), roundCoord(maxZ)]];
  }
  return boxes;
}

const LEAF_TRIANGLES = 4;

function buildBvh(
  positions: Float32Array,
  indices: Uint32Array,
): Pick<PreparedCollisionMesh, "nodeBounds" | "nodeStart" | "nodeCount" | "triOrder"> {
  const triangleCount = indices.length / 3;
  const triOrder = new Uint32Array(triangleCount);
  for (let t = 0; t < triangleCount; t += 1) triOrder[t] = t;
  const triBounds = new Float32Array(triangleCount * 6);
  const centroids = new Float32Array(triangleCount * 3);
  for (let t = 0; t < triangleCount; t += 1) {
    const a = indices[t * 3]! * 3;
    const b = indices[t * 3 + 1]! * 3;
    const c = indices[t * 3 + 2]! * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      const pa = positions[a + axis]!;
      const pb = positions[b + axis]!;
      const pc = positions[c + axis]!;
      const lo = Math.min(pa, pb, pc);
      const hi = Math.max(pa, pb, pc);
      triBounds[t * 6 + axis] = lo;
      triBounds[t * 6 + 3 + axis] = hi;
      centroids[t * 3 + axis] = (lo + hi) / 2;
    }
  }

  const maxNodes = Math.max(1, 2 * triangleCount - 1);
  const nodeBounds = new Float32Array(maxNodes * 6);
  const nodeStart = new Int32Array(maxNodes);
  const nodeCount = new Int32Array(maxNodes);
  let usedNodes = 0;

  function build(start: number, count: number): number {
    const node = usedNodes;
    usedNodes += 1;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let i = start; i < start + count; i += 1) {
      const t = triOrder[i]! * 6;
      if (triBounds[t]! < minX) minX = triBounds[t]!;
      if (triBounds[t + 1]! < minY) minY = triBounds[t + 1]!;
      if (triBounds[t + 2]! < minZ) minZ = triBounds[t + 2]!;
      if (triBounds[t + 3]! > maxX) maxX = triBounds[t + 3]!;
      if (triBounds[t + 4]! > maxY) maxY = triBounds[t + 4]!;
      if (triBounds[t + 5]! > maxZ) maxZ = triBounds[t + 5]!;
    }
    nodeBounds[node * 6] = minX;
    nodeBounds[node * 6 + 1] = minY;
    nodeBounds[node * 6 + 2] = minZ;
    nodeBounds[node * 6 + 3] = maxX;
    nodeBounds[node * 6 + 4] = maxY;
    nodeBounds[node * 6 + 5] = maxZ;

    if (count <= LEAF_TRIANGLES) {
      nodeStart[node] = start;
      nodeCount[node] = count;
      return node;
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const spanZ = maxZ - minZ;
    const axis = spanX >= spanY && spanX >= spanZ ? 0 : spanY >= spanZ ? 1 : 2;
    triOrder.subarray(start, start + count).sort((a, b) => centroids[a * 3 + axis]! - centroids[b * 3 + axis]!);
    const mid = start + (count >> 1);

    nodeCount[node] = 0;
    build(start, mid - start);
    nodeStart[node] = build(mid, start + count - mid);
    return node;
  }

  build(0, triangleCount);
  return {
    nodeBounds: nodeBounds.slice(0, usedNodes * 6),
    nodeStart: nodeStart.slice(0, usedNodes),
    nodeCount: nodeCount.slice(0, usedNodes),
    triOrder,
  };
}

const preparedCache = new WeakMap<CollisionMeshData, PreparedCollisionMesh | null>();

/**
 * Decode a stored collision mesh and index it with a BVH. Memoized per data object, so the shell and
 * a headless host preparing the same catalog entry share one build. Returns `null` (also memoized)
 * when the payload is malformed.
 */
export function prepareCollisionMesh(data: CollisionMeshData): PreparedCollisionMesh | null {
  const cached = preparedCache.get(data);
  if (cached !== undefined) return cached;
  const prepared = decodeAndBuild(data);
  preparedCache.set(data, prepared);
  return prepared;
}

function decodeAndBuild(data: CollisionMeshData): PreparedCollisionMesh | null {
  const { vertexCount, triangleCount } = data;
  if (!Number.isInteger(vertexCount) || vertexCount < 3) return null;
  if (!Number.isInteger(triangleCount) || triangleCount < 1) return null;
  const positionBytes = base64ToBytes(data.positions);
  const indexBytes = base64ToBytes(data.indices);
  if (positionBytes === null || indexBytes === null) return null;
  if (positionBytes.length !== vertexCount * 6) return null;
  const wide = vertexCount > 65536;
  if (indexBytes.length !== triangleCount * 3 * (wide ? 4 : 2)) return null;

  const minX = data.min[0];
  const minY = data.min[1];
  const minZ = data.min[2];
  const spanX = data.max[0] - minX;
  const spanY = data.max[1] - minY;
  const spanZ = data.max[2] - minZ;
  if (!Number.isFinite(minX) || !Number.isFinite(spanX) || spanX < 0 || spanY < 0 || spanZ < 0) return null;

  const positionView = new DataView(positionBytes.buffer, positionBytes.byteOffset, positionBytes.byteLength);
  const positions = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v += 1) {
    positions[v * 3] = minX + (positionView.getUint16(v * 6, true) / 65535) * spanX;
    positions[v * 3 + 1] = minY + (positionView.getUint16(v * 6 + 2, true) / 65535) * spanY;
    positions[v * 3 + 2] = minZ + (positionView.getUint16(v * 6 + 4, true) / 65535) * spanZ;
  }

  const indexView = new DataView(indexBytes.buffer, indexBytes.byteOffset, indexBytes.byteLength);
  const indices = new Uint32Array(triangleCount * 3);
  for (let i = 0; i < indices.length; i += 1) {
    const value = wide ? indexView.getUint32(i * 4, true) : indexView.getUint16(i * 2, true);
    if (value >= vertexCount) return null;
    indices[i] = value;
  }

  return { positions, indices, ...buildBvh(positions, indices) };
}

// Traversal scratch — module-level so the per-ray hot path allocates nothing. Safe because scene
// raycasts run on a single thread and traversal never re-enters.
const traversalStack = new Int32Array(64);

function nodeIntersects(
  bounds: Float32Array,
  node: number,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  tLimit: number,
): boolean {
  let tMin = 0;
  let tMax = tLimit;
  for (let axis = 0; axis < 3; axis += 1) {
    const origin = axis === 0 ? ox : axis === 1 ? oy : oz;
    const dir = axis === 0 ? dx : axis === 1 ? dy : dz;
    const lo = bounds[node * 6 + axis]!;
    const hi = bounds[node * 6 + 3 + axis]!;
    if (Math.abs(dir) < 1e-12) {
      if (origin < lo || origin > hi) return false;
      continue;
    }
    const inv = 1 / dir;
    const t1 = (lo - origin) * inv;
    const t2 = (hi - origin) * inv;
    const near = t1 < t2 ? t1 : t2;
    const far = t1 < t2 ? t2 : t1;
    if (near > tMin) tMin = near;
    if (far < tMax) tMax = far;
    if (tMin > tMax) return false;
  }
  return true;
}

/**
 * Nearest triangle hit for a world-space ray against a prepared mesh placed like its rendered model:
 * model space scaled uniformly by `scale`, translated by entity-local `translate`, yaw-rotated by
 * `rotationY`, and moved to `position` — the same composition {@link "scene/colliders".ModelBodySource}
 * fitting applies to the AABB. Allocation-free until the returned hit. `distance` is world distance
 * along `direction` (callers pass `direction` normalized); `normal` is the world-space geometric
 * triangle normal facing the ray.
 */
export function raycastCollisionMesh(
  mesh: PreparedCollisionMesh,
  origin: EntityPosition,
  direction: EntityPosition,
  maxDistance: number,
  position: EntityPosition,
  rotationY: number,
  scale: number,
  translate: EntityPosition,
): CollisionMeshHit | null {
  if (!(scale > 0) || !Number.isFinite(scale)) return null;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  // World → entity-local (inverse of colliders.worldOffset's yaw), then local → model space.
  const wx = origin[0] - position[0];
  const wy = origin[1] - position[1];
  const wz = origin[2] - position[2];
  const invScale = 1 / scale;
  const ox = (wx * cos - wz * sin - translate[0]) * invScale;
  const oy = (wy - translate[1]) * invScale;
  const oz = (wx * sin + wz * cos - translate[2]) * invScale;
  // Direction is not renormalized, so the parametric t below is world distance directly.
  const dx = (direction[0] * cos - direction[2] * sin) * invScale;
  const dy = direction[1] * invScale;
  const dz = (direction[0] * sin + direction[2] * cos) * invScale;

  const { positions, indices, nodeBounds, nodeStart, nodeCount, triOrder } = mesh;
  let bestT = maxDistance;
  let bestTriangle = -1;
  let stackSize = 0;
  traversalStack[stackSize] = 0;
  stackSize += 1;
  while (stackSize > 0) {
    stackSize -= 1;
    const node = traversalStack[stackSize]!;
    if (!nodeIntersects(nodeBounds, node, ox, oy, oz, dx, dy, dz, bestT)) continue;
    const count = nodeCount[node]!;
    if (count === 0) {
      traversalStack[stackSize] = nodeStart[node]!;
      traversalStack[stackSize + 1] = node + 1;
      stackSize += 2;
      continue;
    }
    const start = nodeStart[node]!;
    for (let i = start; i < start + count; i += 1) {
      const triangle = triOrder[i]!;
      const a = indices[triangle * 3]! * 3;
      const b = indices[triangle * 3 + 1]! * 3;
      const c = indices[triangle * 3 + 2]! * 3;
      const ax = positions[a]!;
      const ay = positions[a + 1]!;
      const az = positions[a + 2]!;
      const e1x = positions[b]! - ax;
      const e1y = positions[b + 1]! - ay;
      const e1z = positions[b + 2]! - az;
      const e2x = positions[c]! - ax;
      const e2y = positions[c + 1]! - ay;
      const e2z = positions[c + 2]! - az;
      // Möller–Trumbore, double-sided.
      const px = dy * e2z - dz * e2y;
      const py = dz * e2x - dx * e2z;
      const pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const invDet = 1 / det;
      const tx = ox - ax;
      const ty = oy - ay;
      const tz = oz - az;
      const u = (tx * px + ty * py + tz * pz) * invDet;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y;
      const qy = tz * e1x - tx * e1z;
      const qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * invDet;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
      if (t > 1e-6 && t < bestT) {
        bestT = t;
        bestTriangle = triangle;
      }
    }
  }
  if (bestTriangle < 0) return null;

  const a = indices[bestTriangle * 3]! * 3;
  const b = indices[bestTriangle * 3 + 1]! * 3;
  const c = indices[bestTriangle * 3 + 2]! * 3;
  const e1x = positions[b]! - positions[a]!;
  const e1y = positions[b + 1]! - positions[a + 1]!;
  const e1z = positions[b + 2]! - positions[a + 2]!;
  const e2x = positions[c]! - positions[a]!;
  const e2y = positions[c + 1]! - positions[a + 1]!;
  const e2z = positions[c + 2]! - positions[a + 2]!;
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length;
  ny /= length;
  nz /= length;
  if (nx * dx + ny * dy + nz * dz > 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  return {
    distance: bestT,
    normal: [nx * cos + nz * sin, ny, -nx * sin + nz * cos],
  };
}

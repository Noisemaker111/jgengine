import type { ModelDims } from "@jgengine/core/scene/assetCatalog";
import { encodeCollisionMesh, type CollisionMeshData } from "@jgengine/core/scene/collisionMesh";

export type { ModelDims };

type Mat4 = readonly number[];

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

interface GltfNode {
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType?: number;
  count?: number;
  type?: string;
  min?: number[];
  max?: number[];
}

interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

interface GltfPrimitive {
  attributes?: Record<string, number>;
  indices?: number;
  mode?: number;
}

interface GltfMesh {
  primitives?: GltfPrimitive[];
}

interface GltfScene {
  nodes?: number[];
}

interface GltfJson {
  scene?: number;
  scenes?: GltfScene[];
  nodes?: GltfNode[];
  meshes?: GltfMesh[];
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function multiply(a: Mat4, b: Mat4): number[] {
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function fromTRS(node: GltfNode): number[] {
  if (node.matrix !== undefined && node.matrix.length === 16) return [...node.matrix];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = qx! + qx!;
  const y2 = qy! + qy!;
  const z2 = qz! + qz!;
  const xx = qx! * x2;
  const xy = qx! * y2;
  const xz = qx! * z2;
  const yy = qy! * y2;
  const yz = qy! * z2;
  const zz = qz! * z2;
  const wx = qw! * x2;
  const wy = qw! * y2;
  const wz = qw! * z2;
  return [
    (1 - (yy + zz)) * sx!,
    (xy + wz) * sx!,
    (xz - wy) * sx!,
    0,
    (xy - wz) * sy!,
    (1 - (xx + zz)) * sy!,
    (yz + wx) * sy!,
    0,
    (xz + wy) * sz!,
    (yz - wx) * sz!,
    (1 - (xx + yy)) * sz!,
    0,
    tx!,
    ty!,
    tz!,
    1,
  ];
}

function transformPoint(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

function readJsonChunk(bytes: Uint8Array): GltfJson | null {
  if (bytes.byteLength < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return null;
  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== CHUNK_JSON) return null;
  const start = 20;
  const end = start + chunkLength;
  if (end > bytes.byteLength) return null;
  const json = new TextDecoder().decode(bytes.subarray(start, end));
  try {
    return JSON.parse(json) as GltfJson;
  } catch {
    return null;
  }
}

interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

function accumulate(bounds: Bounds, x: number, y: number, z: number): void {
  if (x < bounds.min[0]) bounds.min[0] = x;
  if (y < bounds.min[1]) bounds.min[1] = y;
  if (z < bounds.min[2]) bounds.min[2] = z;
  if (x > bounds.max[0]) bounds.max[0] = x;
  if (y > bounds.max[1]) bounds.max[1] = y;
  if (z > bounds.max[2]) bounds.max[2] = z;
}

function walk(gltf: GltfJson, nodeIndex: number, parent: Mat4, bounds: Bounds): void {
  const node = gltf.nodes?.[nodeIndex];
  if (node === undefined) return;
  const world = multiply(parent, fromTRS(node));
  if (node.mesh !== undefined) {
    const mesh = gltf.meshes?.[node.mesh];
    for (const primitive of mesh?.primitives ?? []) {
      const accessorIndex = primitive.attributes?.POSITION;
      if (accessorIndex === undefined) continue;
      const accessor = gltf.accessors?.[accessorIndex];
      const min = accessor?.min;
      const max = accessor?.max;
      if (min === undefined || max === undefined || min.length < 3 || max.length < 3) continue;
      for (let corner = 0; corner < 8; corner += 1) {
        const cx = (corner & 1) === 0 ? min[0]! : max[0]!;
        const cy = (corner & 2) === 0 ? min[1]! : max[1]!;
        const cz = (corner & 4) === 0 ? min[2]! : max[2]!;
        const [wx, wy, wz] = transformPoint(world, cx, cy, cz);
        accumulate(bounds, wx, wy, wz);
      }
    }
  }
  for (const child of node.children ?? []) walk(gltf, child, world, bounds);
}

export function readGlbDims(bytes: Uint8Array): ModelDims | null {
  const gltf = readJsonChunk(bytes);
  if (gltf === null) return null;
  const sceneIndex = gltf.scene ?? 0;
  const roots = gltf.scenes?.[sceneIndex]?.nodes ?? gltf.nodes?.map((_, index) => index) ?? [];
  const bounds: Bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const root of roots) walk(gltf, root, IDENTITY, bounds);
  if (!Number.isFinite(bounds.min[0]) || !Number.isFinite(bounds.max[0])) return null;
  return {
    footprint: { w: bounds.max[0] - bounds.min[0], d: bounds.max[2] - bounds.min[2] },
    center: { x: (bounds.min[0] + bounds.max[0]) / 2, z: (bounds.min[2] + bounds.max[2]) / 2 },
    minY: bounds.min[1],
    maxY: bounds.max[1],
  };
}

const COMPONENT_FLOAT = 5126;
const COMPONENT_U8 = 5121;
const COMPONENT_U16 = 5123;
const COMPONENT_U32 = 5125;
const MODE_TRIANGLES = 4;

/** The GLB's binary chunk, or `null` for a JSON-only GLB (no geometry buffer to read). */
function readBinChunk(bytes: Uint8Array): Uint8Array | null {
  if (bytes.byteLength < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return null;
  const jsonChunkLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON) return null;
  const header = 20 + jsonChunkLength;
  if (header + 8 > bytes.byteLength) return null;
  const chunkLength = view.getUint32(header, true);
  if (view.getUint32(header + 4, true) !== CHUNK_BIN) return null;
  const start = header + 8;
  const end = Math.min(start + chunkLength, bytes.byteLength);
  return bytes.subarray(start, end);
}

/** Float32 VEC3 accessor values in model space, honoring bufferView/accessor byteOffset and byteStride; `null` for a malformed or out-of-bounds accessor. */
function readVec3Accessor(gltf: GltfJson, bin: Uint8Array, accessorIndex: number): Float64Array | null {
  const accessor = gltf.accessors?.[accessorIndex];
  if (accessor === undefined) return null;
  if (accessor.componentType !== COMPONENT_FLOAT || accessor.type !== "VEC3") return null;
  const count = accessor.count;
  if (count === undefined || count <= 0) return null;
  if (accessor.bufferView === undefined) return null;
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (bufferView === undefined) return null;
  const stride = bufferView.byteStride ?? 12;
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  if (base < 0 || base + (count - 1) * stride + 12 > bin.byteLength) return null;
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const out = new Float64Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const offset = base + i * stride;
    out[i * 3] = view.getFloat32(offset, true);
    out[i * 3 + 1] = view.getFloat32(offset + 4, true);
    out[i * 3 + 2] = view.getFloat32(offset + 8, true);
  }
  return out;
}

/** Scalar index accessor values (u8/u16/u32), honoring byteOffset and byteStride; `null` for a malformed or out-of-bounds accessor. */
function readIndexAccessor(gltf: GltfJson, bin: Uint8Array, accessorIndex: number): Uint32Array | null {
  const accessor = gltf.accessors?.[accessorIndex];
  if (accessor === undefined || accessor.type !== "SCALAR") return null;
  const componentType = accessor.componentType;
  const componentBytes =
    componentType === COMPONENT_U8 ? 1 : componentType === COMPONENT_U16 ? 2 : componentType === COMPONENT_U32 ? 4 : 0;
  if (componentBytes === 0) return null;
  const count = accessor.count;
  if (count === undefined || count <= 0) return null;
  if (accessor.bufferView === undefined) return null;
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (bufferView === undefined) return null;
  const stride = bufferView.byteStride ?? componentBytes;
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  if (base < 0 || base + (count - 1) * stride + componentBytes > bin.byteLength) return null;
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const out = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) {
    const offset = base + i * stride;
    out[i] =
      componentType === COMPONENT_U8
        ? view.getUint8(offset)
        : componentType === COMPONENT_U16
          ? view.getUint16(offset, true)
          : view.getUint32(offset, true);
  }
  return out;
}

interface TriangleSoup {
  positions: number[];
  indices: number[];
}

/** Append one triangle primitive's world-space geometry to the soup; skips non-triangle modes and malformed accessors, appending nothing on failure. */
function addPrimitive(gltf: GltfJson, bin: Uint8Array, primitive: GltfPrimitive, world: Mat4, soup: TriangleSoup): void {
  if ((primitive.mode ?? MODE_TRIANGLES) !== MODE_TRIANGLES) return;
  const accessorIndex = primitive.attributes?.POSITION;
  if (accessorIndex === undefined) return;
  const positions = readVec3Accessor(gltf, bin, accessorIndex);
  if (positions === null) return;
  let localIndices: Uint32Array | null = null;
  if (primitive.indices !== undefined) {
    localIndices = readIndexAccessor(gltf, bin, primitive.indices);
    if (localIndices === null) return;
  }
  const vertexBase = soup.positions.length / 3;
  const vertexCount = positions.length / 3;
  for (let v = 0; v < vertexCount; v += 1) {
    const [wx, wy, wz] = transformPoint(world, positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!);
    soup.positions.push(wx, wy, wz);
  }
  if (localIndices === null) {
    for (let v = 0; v < vertexCount; v += 1) soup.indices.push(vertexBase + v);
  } else {
    for (let i = 0; i < localIndices.length; i += 1) soup.indices.push(vertexBase + localIndices[i]!);
  }
}

function walkCollision(gltf: GltfJson, bin: Uint8Array, nodeIndex: number, parent: Mat4, soup: TriangleSoup): void {
  const node = gltf.nodes?.[nodeIndex];
  if (node === undefined) return;
  const world = multiply(parent, fromTRS(node));
  if (node.mesh !== undefined) {
    const mesh = gltf.meshes?.[node.mesh];
    for (const primitive of mesh?.primitives ?? []) addPrimitive(gltf, bin, primitive, world, soup);
  }
  for (const child of node.children ?? []) walkCollision(gltf, bin, child, world, soup);
}

/**
 * Extract a model-space collision triangle soup from a GLB and compress it with {@link encodeCollisionMesh}.
 * Walks the default scene, transforming each TRIANGLES primitive's float32 VEC3 positions by the node's world
 * matrix, and returns `null` for a JSON-only GLB or when no triangle survives quantization.
 */
export function readGlbCollisionMesh(bytes: Uint8Array): CollisionMeshData | null {
  const gltf = readJsonChunk(bytes);
  if (gltf === null) return null;
  const bin = readBinChunk(bytes);
  if (bin === null) return null;
  const sceneIndex = gltf.scene ?? 0;
  const roots = gltf.scenes?.[sceneIndex]?.nodes ?? gltf.nodes?.map((_, index) => index) ?? [];
  const soup: TriangleSoup = { positions: [], indices: [] };
  for (const root of roots) walkCollision(gltf, bin, root, IDENTITY, soup);
  return encodeCollisionMesh(soup);
}

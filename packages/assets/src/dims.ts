import type { ModelDims } from "@jgengine/core/scene/assetCatalog";

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
  min?: number[];
  max?: number[];
}

interface GltfPrimitive {
  attributes?: Record<string, number>;
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
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

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
  };
}

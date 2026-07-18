import { describe, expect, test } from "bun:test";

import { readGlbCollisionMesh, readGlbDims } from "./dims";

interface Node {
  mesh?: number;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

function buildGlb(gltf: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const pad = (4 - (json.byteLength % 4)) % 4;
  const chunkLength = json.byteLength + pad;
  const total = 12 + 8 + chunkLength;
  const buffer = new Uint8Array(total);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, chunkLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  buffer.set(json, 20);
  for (let index = 0; index < pad; index += 1) buffer[20 + json.byteLength + index] = 0x20;
  return buffer;
}

function glbWith(
  min: number[],
  max: number[],
  node: Partial<Node> = {},
): Uint8Array {
  return buildGlb({
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, ...node }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ min, max }],
  });
}

describe("readGlbDims", () => {
  test("corner-pivot box reports footprint, center, and vertical span", () => {
    const dims = readGlbDims(glbWith([0, 0, 0], [2, 1, 3]));
    expect(dims).not.toBeNull();
    expect(dims!.footprint).toEqual({ w: 2, d: 3 });
    expect(dims!.center).toEqual({ x: 1, z: 1.5 });
    expect(dims!.minY).toBe(0);
    expect(dims!.maxY).toBe(1);
  });

  test("node translation shifts the measured bounds", () => {
    const dims = readGlbDims(glbWith([0, 0, 0], [2, 1, 2], { translation: [10, 5, -4] }));
    expect(dims!.center).toEqual({ x: 11, z: -3 });
    expect(dims!.minY).toBe(5);
    expect(dims!.maxY).toBe(6);
  });

  test("node scale expands the footprint", () => {
    const dims = readGlbDims(glbWith([0, 0, 0], [1, 1, 1], { scale: [2, 2, 2] }));
    expect(dims!.footprint).toEqual({ w: 2, d: 2 });
    expect(dims!.center).toEqual({ x: 1, z: 1 });
  });

  test("90-degree Y rotation swaps width and depth", () => {
    const dims = readGlbDims(
      glbWith([0, 0, 0], [4, 1, 1], { rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }),
    );
    expect(dims!.footprint.w).toBeCloseTo(1, 5);
    expect(dims!.footprint.d).toBeCloseTo(4, 5);
  });

  test("child node bounds compose with the parent transform", () => {
    const dims = readGlbDims(
      buildGlb({
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [
          { children: [1], translation: [5, 0, 0] },
          { mesh: 0, translation: [0, 0, 3] },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        accessors: [{ min: [0, 0, 0], max: [2, 1, 2] }],
      }),
    );
    expect(dims!.center).toEqual({ x: 6, z: 4 });
  });

  test("returns null for non-GLB bytes", () => {
    expect(readGlbDims(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  test("returns null when no primitive carries POSITION bounds", () => {
    const dims = readGlbDims(
      buildGlb({
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: {} }] }],
        accessors: [],
      }),
    );
    expect(dims).toBeNull();
  });
});

// --- readGlbCollisionMesh coverage: two-chunk (JSON + BIN) GLBs ---

function align4(n: number): number {
  return (n + 3) & ~3;
}

/** Concatenate BIN sections, each 4-byte aligned; returns the buffer and each section's byte offset. */
function packBin(sections: Uint8Array[]): { bin: Uint8Array; offsets: number[] } {
  const offsets: number[] = [];
  let total = 0;
  for (const section of sections) {
    offsets.push(total);
    total = align4(total + section.byteLength);
  }
  const bin = new Uint8Array(total);
  sections.forEach((section, index) => bin.set(section, offsets[index]!));
  return { bin, offsets };
}

function floatBytes(values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return out;
}

function indexBytes(values: number[], componentType: number): Uint8Array {
  const size = componentType === 5121 ? 1 : componentType === 5123 ? 2 : 4;
  const out = new Uint8Array(values.length * size);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => {
    if (size === 1) view.setUint8(index, value);
    else if (size === 2) view.setUint16(index * 2, value, true);
    else view.setUint32(index * 4, value, true);
  });
  return out;
}

/** Assemble a two-chunk GLB: JSON chunk (space-padded) + BIN chunk (zero-padded), both 4-byte aligned. */
function buildGlbWithBin(gltf: unknown, bin: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = (4 - (json.byteLength % 4)) % 4;
  const jsonChunkLength = json.byteLength + jsonPad;
  const binPad = (4 - (bin.byteLength % 4)) % 4;
  const binChunkLength = bin.byteLength + binPad;
  const total = 12 + 8 + jsonChunkLength + 8 + binChunkLength;
  const buffer = new Uint8Array(total);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunkLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  buffer.set(json, 20);
  for (let index = 0; index < jsonPad; index += 1) buffer[20 + json.byteLength + index] = 0x20;
  const binHeader = 20 + jsonChunkLength;
  view.setUint32(binHeader, binChunkLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  buffer.set(bin, binHeader + 8);
  return buffer;
}

function minMax(positions: number[]): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a += 1) {
      min[a] = Math.min(min[a]!, positions[i + a]!);
      max[a] = Math.max(max[a]!, positions[i + a]!);
    }
  }
  return { min, max };
}

interface MeshGlbOptions {
  positions: number[];
  indices?: number[];
  indexType?: number;
  mode?: number;
  node?: Node;
}

/** Build a single-mesh GLB with tightly-packed float32 VEC3 positions and optional scalar indices in the BIN chunk. */
function buildMeshGlb(options: MeshGlbOptions): Uint8Array {
  const indexType = options.indexType ?? 5123;
  const posBytes = floatBytes(options.positions);
  const count = options.positions.length / 3;
  const { min, max } = minMax(options.positions);
  const sections = [posBytes];
  if (options.indices !== undefined) sections.push(indexBytes(options.indices, indexType));
  const { bin, offsets } = packBin(sections);
  const bufferViews: unknown[] = [{ buffer: 0, byteOffset: offsets[0], byteLength: posBytes.byteLength }];
  const accessors: unknown[] = [{ bufferView: 0, componentType: 5126, count, type: "VEC3", min, max }];
  const primitive: Record<string, unknown> = { attributes: { POSITION: 0 } };
  if (options.mode !== undefined) primitive.mode = options.mode;
  if (options.indices !== undefined) {
    bufferViews.push({ buffer: 0, byteOffset: offsets[1], byteLength: indexBytes(options.indices, indexType).byteLength });
    accessors.push({ bufferView: 1, componentType: indexType, count: options.indices.length, type: "SCALAR" });
    primitive.indices = 1;
  }
  return buildGlbWithBin(
    {
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, ...(options.node ?? {}) }],
      meshes: [{ primitives: [primitive] }],
      accessors,
      bufferViews,
      buffers: [{ byteLength: bin.byteLength }],
    },
    bin,
  );
}

// Unit tetrahedron: 4 verts, 4 triangular faces.
const TETRA_POSITIONS = [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0];
const TETRA_INDICES = [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3];

describe("readGlbCollisionMesh", () => {
  test("extracts an indexed tetrahedron with u16 indices", () => {
    const mesh = readGlbCollisionMesh(buildMeshGlb({ positions: TETRA_POSITIONS, indices: TETRA_INDICES }));
    expect(mesh).not.toBeNull();
    expect(mesh!.triangleCount).toBe(4);
    expect(mesh!.vertexCount).toBe(4);
    expect(mesh!.min[0]).toBeCloseTo(0, 5);
    expect(mesh!.min[1]).toBeCloseTo(0, 5);
    expect(mesh!.min[2]).toBeCloseTo(0, 5);
    expect(mesh!.max[0]).toBeCloseTo(1, 5);
    expect(mesh!.max[1]).toBeCloseTo(1, 5);
    expect(mesh!.max[2]).toBeCloseTo(1, 5);
  });

  test("applies the node transform to the extracted bounds", () => {
    const mesh = readGlbCollisionMesh(
      buildMeshGlb({ positions: TETRA_POSITIONS, indices: TETRA_INDICES, node: { translation: [10, 5, -4] } }),
    );
    expect(mesh).not.toBeNull();
    expect(mesh!.min[0]).toBeCloseTo(10, 5);
    expect(mesh!.min[1]).toBeCloseTo(5, 5);
    expect(mesh!.min[2]).toBeCloseTo(-4, 5);
    expect(mesh!.max[0]).toBeCloseTo(11, 5);
    expect(mesh!.max[1]).toBeCloseTo(6, 5);
    expect(mesh!.max[2]).toBeCloseTo(-3, 5);
  });

  test("reads u32 indices", () => {
    const mesh = readGlbCollisionMesh(
      buildMeshGlb({ positions: TETRA_POSITIONS, indices: TETRA_INDICES, indexType: 5125 }),
    );
    expect(mesh!.triangleCount).toBe(4);
    expect(mesh!.vertexCount).toBe(4);
  });

  test("reads u8 indices", () => {
    const mesh = readGlbCollisionMesh(
      buildMeshGlb({ positions: TETRA_POSITIONS, indices: TETRA_INDICES, indexType: 5121 }),
    );
    expect(mesh!.triangleCount).toBe(4);
    expect(mesh!.vertexCount).toBe(4);
  });

  test("emits sequential triangles for a non-indexed primitive", () => {
    // Two disjoint triangles, six distinct vertices, no index accessor.
    const positions = [0, 0, 0, 1, 0, 0, 0, 0, 1, 2, 0, 0, 3, 0, 0, 2, 0, 1];
    const mesh = readGlbCollisionMesh(buildMeshGlb({ positions }));
    expect(mesh).not.toBeNull();
    expect(mesh!.triangleCount).toBe(2);
    expect(mesh!.vertexCount).toBe(6);
  });

  test("honors an interleaved position byteStride", () => {
    // Positions packed at stride 16 (12 bytes VEC3 + 4 bytes padding per vertex).
    const stride = 16;
    const verts = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
    ];
    const posSection = new Uint8Array(verts.length * stride);
    const posView = new DataView(posSection.buffer);
    verts.forEach((v, i) => {
      posView.setFloat32(i * stride, v[0]!, true);
      posView.setFloat32(i * stride + 4, v[1]!, true);
      posView.setFloat32(i * stride + 8, v[2]!, true);
    });
    const { bin, offsets } = packBin([posSection, indexBytes(TETRA_INDICES, 5123)]);
    const glb = buildGlbWithBin(
      {
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
        accessors: [
          { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [0, 0, 0], max: [1, 1, 1] },
          { bufferView: 1, componentType: 5123, count: TETRA_INDICES.length, type: "SCALAR" },
        ],
        bufferViews: [
          { buffer: 0, byteOffset: offsets[0], byteLength: posSection.byteLength, byteStride: stride },
          { buffer: 0, byteOffset: offsets[1], byteLength: indexBytes(TETRA_INDICES, 5123).byteLength },
        ],
        buffers: [{ byteLength: bin.byteLength }],
      },
      bin,
    );
    const mesh = readGlbCollisionMesh(glb);
    expect(mesh).not.toBeNull();
    expect(mesh!.triangleCount).toBe(4);
    expect(mesh!.vertexCount).toBe(4);
    expect(mesh!.max[0]).toBeCloseTo(1, 5);
    expect(mesh!.max[1]).toBeCloseTo(1, 5);
    expect(mesh!.max[2]).toBeCloseTo(1, 5);
  });

  test("returns null for a JSON-only GLB (no BIN chunk)", () => {
    expect(readGlbCollisionMesh(glbWith([0, 0, 0], [1, 1, 1]))).toBeNull();
  });

  test("skips a non-triangle (LINES) primitive", () => {
    const mesh = readGlbCollisionMesh(buildMeshGlb({ positions: TETRA_POSITIONS, indices: TETRA_INDICES, mode: 1 }));
    expect(mesh).toBeNull();
  });

  test("readGlbDims still measures accessor min/max on a two-chunk GLB", () => {
    const dims = readGlbDims(buildMeshGlb({ positions: TETRA_POSITIONS, indices: TETRA_INDICES }));
    expect(dims).not.toBeNull();
    expect(dims!.footprint).toEqual({ w: 1, d: 1 });
    expect(dims!.center).toEqual({ x: 0.5, z: 0.5 });
    expect(dims!.minY).toBe(0);
    expect(dims!.maxY).toBe(1);
  });
});

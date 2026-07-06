import { describe, expect, test } from "bun:test";

import { readGlbDims } from "./dims";

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
  test("corner-pivot box reports footprint, center, and minY", () => {
    const dims = readGlbDims(glbWith([0, 0, 0], [2, 1, 3]));
    expect(dims).not.toBeNull();
    expect(dims!.footprint).toEqual({ w: 2, d: 3 });
    expect(dims!.center).toEqual({ x: 1, z: 1.5 });
    expect(dims!.minY).toBe(0);
  });

  test("node translation shifts the measured bounds", () => {
    const dims = readGlbDims(glbWith([0, 0, 0], [2, 1, 2], { translation: [10, 5, -4] }));
    expect(dims!.center).toEqual({ x: 11, z: -3 });
    expect(dims!.minY).toBe(5);
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

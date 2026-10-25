import { describe, expect, test } from "bun:test";

import { Document } from "@gltf-transform/core";

import { downscaleJpeg, thinIslands } from "./modelLibraryPull";

/** One primitive of `count` separate triangles, each 1 m apart on x, under a material named `material`. */
function leaves(count: number, material: string): Document {
  const document = new Document();
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < count; i += 1) {
    positions.push(i, 0, 0, i + 0.1, 0, 0, i, 0.1, 0);
    indices.push(i * 3, i * 3 + 1, i * 3 + 2);
  }
  const primitive = document
    .createPrimitive()
    .setAttribute("POSITION", document.createAccessor().setType("VEC3").setArray(new Float32Array(positions)))
    .setIndices(document.createAccessor().setArray(new Uint32Array(indices)))
    .setMaterial(document.createMaterial(material));
  document.createMesh("tree").addPrimitive(primitive);
  return document;
}

describe("model library pull", () => {
  test("thinIslands keeps an even share of leaf clusters and grows each kept one about its centre", () => {
    const document = leaves(100, "tree_leaves");
    const removed = thinIslands(document, /leaves/, 0.2);
    const primitive = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    const kept = primitive.getIndices()!.getCount() / 3;
    expect(kept + removed).toBe(100);
    expect(kept).toBeGreaterThanOrEqual(15);
    expect(kept).toBeLessThanOrEqual(25);
    expect(primitive.getAttribute("POSITION")!.getCount()).toBe(kept * 3);
    const a = primitive.getAttribute("POSITION")!.getElement(0, []);
    const b = primitive.getAttribute("POSITION")!.getElement(1, []);
    expect(b[0]! - a[0]!).toBeCloseTo(0.1 * Math.pow(0.2, -0.35), 4);
  });

  test("thinIslands leaves other materials alone", () => {
    const document = leaves(10, "tree_trunk");
    expect(thinIslands(document, /leaves/, 0.1)).toBe(0);
  });

  test("downscaleJpeg rejects bytes that are not a JPEG", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(() => downscaleJpeg(bytes, 512)).toThrow();
  });
});

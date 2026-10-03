import { expect, test } from "bun:test";
import * as THREE from "three";
import { createGrassBladeGeometry, createGrassGeometryChunks } from "./grassGeometry";

test("chunking preserves the seeded template, instance bytes and original budget prefix", () => {
  const options = { count: 2500, area: [70, 45] as const, seed: "custom-reeds", tuftBlades: 3,
    heightAt: (x: number, z: number) => x * 0.2 + z * 0.05, height: [0.4, 1.7] as const,
    exclude: [{ center: [3, 4] as const, half: [2, 1] as const }] };
  const source = createGrassBladeGeometry(options);
  const chunks = createGrassGeometryChunks(options);
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.length).toBeLessThanOrEqual(64);
  const indices = chunks.flatMap((chunk) => [...chunk.indices]).sort((a, b) => a - b);
  expect(indices).toEqual(Array.from({ length: source.instanceCount }, (_, i) => i));
  for (const chunk of chunks) {
    expect([...chunk.geometry.index!.array]).toEqual([...source.index!.array]);
    for (const [name, attr] of Object.entries(chunk.geometry.attributes)) {
      const original = source.getAttribute(name);
      if (!(attr instanceof THREE.InstancedBufferAttribute)) {
        expect([...attr.array]).toEqual([...original.array]);
        expect(attr).toBe(chunks[0]!.geometry.getAttribute(name));
      } else {
        const expected = Array.from(chunk.indices).flatMap((index) => [...original.array.slice(index * attr.itemSize, (index + 1) * attr.itemSize)]);
        expect([...attr.array]).toEqual(expected);
      }
    }
    chunk.geometry.dispose();
  }
  source.dispose();
});

test("chunk count stays bounded for enormous patches and empty or collapsed areas", () => {
  for (const options of [{ count: 1000, area: [1e6, 1e6] as const }, { count: 0 }, { count: 20, area: 0 }]) {
    const chunks = createGrassGeometryChunks(options);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThanOrEqual(64);
    expect(chunks.reduce((total, chunk) => total + chunk.geometry.instanceCount, 0)).toBe(Math.ceil(options.count / 5));
    chunks.forEach((chunk) => chunk.geometry.dispose());
  }
});

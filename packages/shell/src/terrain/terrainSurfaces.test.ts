import { expect, test } from "bun:test";
import type { TerrainMaterialLayer } from "@jgengine/core/world/terraform";

import type { TerrainPaintSource } from "./terrainPaintColor";
import { createTerrainPaintTextures, packTerrainPaintWeights, terrainSurfaceClass } from "./terrainSurfaces";

function gridSource(
  layers: TerrainMaterialLayer[],
  cell: (gx: number, gz: number) => { surface: string | null; weights?: number[] },
  cols = 4,
  rows = 2,
): TerrainPaintSource {
  const at = (x: number, z: number) => cell(Math.floor(x), Math.floor(z));
  return {
    layers,
    gridBounds: { minX: 0, minZ: 0, maxX: cols, maxZ: rows },
    cols,
    rows,
    surfaceAt: (x, z) => at(x, z).surface,
    weightsAt: (x, z) => at(x, z).weights ?? [],
  };
}

test("surface ids map to their procedural ground response", () => {
  expect(terrainSurfaceClass("grass")).toBe("grass");
  expect(terrainSurfaceClass("Dry-Grass")).toBe("grass");
  expect(terrainSurfaceClass("path")).toBe("dirt");
  expect(terrainSurfaceClass("stone")).toBe("rock");
  expect(terrainSurfaceClass("gravel")).toBe("gravel");
  expect(terrainSurfaceClass("asphalt")).toBe("road");
  expect(terrainSurfaceClass("crystal")).toBe("ground");
});

test("hard surface ids pack as one-hot coverage in their layer slot", () => {
  const layers: TerrainMaterialLayer[] = [
    { id: "g", surface: "grass", tint: "#336633" },
    { id: "d", surface: "dirt", opacity: 0.5 },
  ];
  const packed = packTerrainPaintWeights(gridSource(layers, gx => ({ surface: gx === 0 ? null : gx === 1 ? "grass" : "dirt" })))!;
  expect(packed.slots.map(slot => slot.surfaceClass)).toEqual(["grass", "dirt"]);
  const [a] = packed.planes;
  expect(Array.from(a.slice(0, 4))).toEqual([0, 0, 0, 0]);
  expect(Array.from(a.slice(4, 8))).toEqual([255, 0, 0, 0]);
  expect(Array.from(a.slice(8, 12))).toEqual([0, 128, 0, 0]);
});

test("blend weights pack per layer and unknown legacy surfaces get their own slot", () => {
  const layers: TerrainMaterialLayer[] = [
    { id: "g", surface: "grass" },
    { id: "s", surface: "sand" },
  ];
  const packed = packTerrainPaintWeights(
    gridSource(layers, gx => (gx === 3 ? { surface: "path" } : { surface: "grass", weights: [0.25, 0.75] })),
  )!;
  expect(Array.from(packed.planes[0].slice(0, 4))).toEqual([64, 191, 0, 0]);
  // The cell's weights length matches the stack, so blend weights win over the dominant id.
  const legacy = packTerrainPaintWeights(gridSource([], gx => ({ surface: gx === 3 ? "path" : null })))!;
  expect(legacy.slots).toHaveLength(1);
  expect(legacy.slots[0]!.surfaceClass).toBe("dirt");
  expect(legacy.planes[0][12]).toBe(255);
});

test("layer tiling scales the pattern around its class neutral point", () => {
  const packed = packTerrainPaintWeights(
    gridSource([{ id: "g", surface: "grass", tiling: 6 }, { id: "r", surface: "rock" }], () => ({ surface: "grass" })),
  )!;
  expect(packed.slots[0]!.scale).toBe(0.5);
  expect(packed.slots[1]!.scale).toBe(1);
});

test("paint textures re-upload in place and reallocate on a grid resize", () => {
  const source = gridSource([{ id: "g", surface: "grass" }], () => ({ surface: "grass" }));
  const packed = packTerrainPaintWeights(source)!;
  const textures = createTerrainPaintTextures(packed);
  const first = textures.uniforms.uPaintA!.value;
  textures.update(packTerrainPaintWeights(source, packed)!);
  expect(textures.uniforms.uPaintA!.value).toBe(first);
  textures.update(packTerrainPaintWeights(gridSource([{ id: "g", surface: "grass" }], () => ({ surface: "grass" }), 8, 8))!);
  expect(textures.uniforms.uPaintA!.value).not.toBe(first);
  expect(textures.uniforms.uPaintGrid!.value.toArray()).toEqual([8, 8]);
  textures.dispose();
});

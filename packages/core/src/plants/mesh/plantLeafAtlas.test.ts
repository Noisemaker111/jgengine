import { describe, expect, test } from "bun:test";

import { createPlantGrowth } from "../growth/plantGrowth";
import { OPEN_TEMPERATE_SITE } from "../growth/plantEnvironment";
import { ACER_SACCHARUM } from "../species/data/acerSaccharum";
import { PINUS_STROBUS } from "../species/data/pinusStrobus";
import { buildPlantMesh, DEFAULT_PLANT_STYLE, PLANT_MESH_LODS } from "./plantMesh";
import { bakePlantLeafAtlas, PLANT_LEAF_ATLAS_CELL_COUNT, plantLeafAtlasKey } from "./plantLeafAtlas";

/** Share of a cell's texels a leaf covers (alpha over one half). */
function cover(atlas: ReturnType<typeof bakePlantLeafAtlas>, cell: number): number {
  const cellPx = atlas.width / PLANT_LEAF_ATLAS_CELL_COUNT;
  let solid = 0;
  for (let y = 0; y < atlas.height; y += 1) {
    for (let x = 0; x < cellPx; x += 1) if ((atlas.data[(y * atlas.width + cell * cellPx + x) * 4 + 3] ?? 0) > 127) solid += 1;
  }
  return solid / (cellPx * atlas.height);
}

describe("plant leaf atlas", () => {
  test("bakes the same texels for the same shape and different ones for another", () => {
    const maple = bakePlantLeafAtlas(ACER_SACCHARUM.leaf.shape, 64);
    expect(bakePlantLeafAtlas(ACER_SACCHARUM.leaf.shape, 64).data).toEqual(maple.data);
    expect(bakePlantLeafAtlas(PINUS_STROBUS.leaf.shape, 64).data).not.toEqual(maple.data);
    expect(plantLeafAtlasKey(ACER_SACCHARUM.leaf.shape)).not.toBe(plantLeafAtlasKey(PINUS_STROBUS.leaf.shape));
  });

  test("every cell holds a leafy silhouette, not a solid card", () => {
    for (const shape of [ACER_SACCHARUM.leaf.shape, PINUS_STROBUS.leaf.shape]) {
      const atlas = bakePlantLeafAtlas(shape, 64);
      for (let cell = 0; cell < PLANT_LEAF_ATLAS_CELL_COUNT; cell += 1) {
        const share = cover(atlas, cell);
        expect(share).toBeGreaterThan(0.08);
        expect(share).toBeLessThan(0.8);
      }
    }
  });

  test("textured foliage carries atlas coordinates at every level; clumps carry none", () => {
    const growth = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, "atlas");
    growth.step(30);
    const structure = growth.structure();
    for (const detail of PLANT_MESH_LODS) {
      const leaves = buildPlantMesh({ structure, detail, structureHash: "-" });
      expect(leaves.look.leafAtlas).toEqual(ACER_SACCHARUM.leaf.shape);
      expect(leaves.leafUvs.length).toBe((leaves.leaves.positions.length / 3) * 2);
      const clumps = buildPlantMesh({ structure, detail, style: { ...DEFAULT_PLANT_STYLE, foliage: "clumps" }, structureHash: "-" });
      expect(clumps.look.leafAtlas).toBeNull();
      expect(clumps.leafUvs.length).toBe(0);
    }
  });
});

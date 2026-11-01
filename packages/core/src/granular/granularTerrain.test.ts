import { describe, expect, test } from "bun:test";

import type { LandformSurface } from "../landform/materials/landformSurface";
import { createEditableTerrain } from "../terrain/terraform";
import { flatField } from "../terrain/terrain";
import { DRY_SAND, GRAVEL } from "./granularMaterial";
import { createGranularTerrain, landformLooseCover } from "./granularTerrain";

// Terrain offsets are stored as 32-bit floats, so heights compare to 6 places.
const bounds = { minX: -4, minZ: -4, maxX: 4, maxZ: 4 };

describe("granular terrain", () => {
  test("sand dug and slumping shows up in the terrain heights, as one undoable delta per step", () => {
    const terrain = createEditableTerrain({ bounds, base: flatField(), cellSize: 0.25 });
    const sand = createGranularTerrain(terrain, { materials: [DRY_SAND], looseDepth: () => 0.5 });
    expect(terrain.sampleHeight(0, 0)).toBeCloseTo(0, 12);
    const taken = sand.dig(0, 0, 0.6, 0.45);
    expect(taken).toBeGreaterThan(0);
    const dug = sand.sync();
    expect(dug.indices.length).toBeGreaterThan(0);
    expect(terrain.sampleHeight(0, 0)).toBeCloseTo(-0.45, 6);
    const deltas = [dug];
    for (let k = 0; k < 120; k += 1) deltas.push(sand.step(1 / 30).delta);
    // The hole's walls slumped in: it is shallower and its rim lower than after the dig.
    expect(terrain.sampleHeight(0, 0)).toBeGreaterThan(-0.44);
    expect(terrain.sampleHeight(0.75, 0)).toBeLessThan(-0.01);
    expect(sand.depthAt(0, 0)).toBeCloseTo(0.5 + terrain.sampleHeight(0, 0), 6);
    for (const delta of deltas.reverse()) terrain.revertDelta(delta);
    expect(terrain.sampleHeight(0, 0)).toBeCloseTo(0, 6);
    expect(terrain.sampleHeight(0.75, 0)).toBeCloseTo(0, 6);
  });

  test("a terrain sculpted under the sand keeps its loose cover after resync", () => {
    const terrain = createEditableTerrain({ bounds, base: flatField(), cellSize: 0.5 });
    const sand = createGranularTerrain(terrain, { materials: [DRY_SAND], looseDepth: () => 0.3, layer: { startAwake: false } });
    terrain.apply({ mode: "raise", center: [2, 2], radius: 1, strength: 0.2 });
    sand.resync();
    expect(sand.depthAt(2, 2)).toBeCloseTo(0.3, 12);
    expect(sand.layer.surface(sand.layer.index(12, 12))).toBeCloseTo(terrain.sampleHeight(2, 2), 6);
  });

  test("a landform's cover sets the loose depth and the material of each vertex", () => {
    const surface: LandformSurface = {
      cols: 2,
      rows: 1,
      cellSize: 4,
      kinds: ["rock", "gravel", "sand", "mud", "soil"],
      weights: new Float32Array([1, 0, 0, 0, 0, 0, 0.3, 0.7, 0, 0]),
      bedrock: new Uint8Array(2),
      bedrockIds: ["granite"],
      coverDepth: new Float32Array([0.05, 1.5]),
      waterDepth: new Float32Array(2),
    };
    const cover = landformLooseCover(surface, { originX: -4, originZ: -4, materials: { sand: 0, gravel: 1 } });
    expect(cover.looseDepth?.(-2, -2)).toBe(0);
    expect(cover.looseDepth?.(2, -2)).toBeCloseTo(1.5, 6);
    expect(cover.materialAt?.(2, -2)).toBe(0);
    const terrain = createEditableTerrain({ bounds, base: flatField(), cellSize: 1 });
    const ground = createGranularTerrain(terrain, { materials: [DRY_SAND, GRAVEL], ...cover });
    expect(ground.depthAt(-2, -2)).toBe(0);
    expect(ground.depthAt(2, -2)).toBeCloseTo(1.5, 6);
  });
});

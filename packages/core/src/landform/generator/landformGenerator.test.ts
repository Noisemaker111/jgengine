import { describe, expect, test } from "bun:test";
import { prepareGenerator, runGenerator } from "../../generator/generator";
import { defaultParamMeta, parseParams } from "../../generator/paramSchema";
import { editableTerrainFromSnapshot } from "../../terrain/terraform";
import { createLandformCache, createLandformGenerator, LANDFORM_SCHEMA, landformKey, landformRecipe, type LandformStore } from "./landformGenerator";
import { landformTerrainSnapshot, type LandformTerrain } from "./landformTerrain";

const SMALL = { ...defaultParamMeta(LANDFORM_SCHEMA), side: 48, cellSize: 50, years: 4e5, seed: "test" };

describe("landform generator", () => {
  test("the same params and seed grow the same terrain, and the cache answers the second time", () => {
    const cache = createLandformCache();
    const generator = createLandformGenerator(cache, { grower: null });
    const first = runGenerator(generator, SMALL);
    expect(cache.keys()).toHaveLength(1);
    expect(runGenerator(generator, SMALL)).toBe(first);
    const fresh = runGenerator(createLandformGenerator(createLandformCache(), { grower: null }), SMALL);
    expect(Array.from(fresh.heights)).toEqual(Array.from(first.heights));
    expect(Array.from(fresh.weights)).toEqual(Array.from(first.weights));
    const other = runGenerator(generator, { ...SMALL, seed: "other" });
    expect(Array.from(other.heights)).not.toEqual(Array.from(first.heights));
    // Uplift over a million years builds relief, and rivers lay sediment.
    let top = -Infinity;
    for (const h of first.heights) top = Math.max(top, h);
    expect(top).toBeGreaterThan(50);
    for (let i = 0; i < first.cols * first.rows; i += 1) {
      let sum = 0;
      for (let k = 0; k < first.kinds.length; k += 1) sum += first.weights[i * first.kinds.length + k] ?? 0;
      expect(sum).toBeCloseTo(1, 4);
    }
  }, 30_000);

  test("prepare grows into the cache and storage, and a fresh cache loads it back without growing", async () => {
    const saved = new Map<string, LandformTerrain>();
    const store: LandformStore = {
      load: async (key) => saved.get(key),
      save: async (key, terrain) => {
        saved.set(key, terrain);
      },
    };
    const generator = createLandformGenerator(createLandformCache({ store }), { grower: null });
    await prepareGenerator(generator, SMALL);
    expect(saved.size).toBe(1);
    let grew = 0;
    const counting = createLandformGenerator(createLandformCache({ store }), {
      grower: {
        grow: async () => {
          grew += 1;
          throw new Error("should load, not grow");
        },
        dispose: () => undefined,
      },
    });
    await prepareGenerator(counting, SMALL);
    expect(grew).toBe(0);
    expect(runGenerator(counting, SMALL)).toBe([...saved.values()][0]);
  }, 30_000);

  test("lower detail keeps the map's extent with fewer cells", () => {
    const params = { ...SMALL, side: 128 };
    const full = landformRecipe(parseParams(LANDFORM_SCHEMA, params), 1);
    const half = landformRecipe(parseParams(LANDFORM_SCHEMA, params), 0.5);
    expect(half.side).toBe(64);
    expect(half.side * half.cellSize).toBeCloseTo(full.side * full.cellSize, 9);
    expect(landformKey(full, "a")).not.toBe(landformKey(half, "a"));
  });

  test("scale shrinks a grown landform to game size without changing its shape", () => {
    const generator = createLandformGenerator(createLandformCache(), { grower: null });
    const full = runGenerator(generator, SMALL);
    const small = runGenerator(generator, { ...SMALL, scale: 0.1 });
    expect(small.cellSize).toBeCloseTo(full.cellSize * 0.1, 9);
    for (let i = 0; i < full.heights.length; i += 97) expect(small.heights[i]).toBeCloseTo((full.heights[i] ?? 0) * 0.1, 3);
    expect(Array.from(small.weights)).toEqual(Array.from(full.weights));
  }, 30_000);

  test("dunes add sand on top of the ground and paint it as sand", () => {
    const terrain = runGenerator(createLandformGenerator(createLandformCache(), { grower: null }), { ...SMALL, uplift: 0, sand: 20, duneSweeps: 200 });
    let sandCells = 0;
    const sand = terrain.kinds.indexOf("sand");
    for (let i = 0; i < terrain.cols * terrain.rows; i += 1) {
      if ((terrain.dunes[i] ?? 0) < 1) continue;
      sandCells += 1;
      expect(terrain.weights[i * terrain.kinds.length + sand]).toBeCloseTo(1, 5);
    }
    expect(sandCells).toBeGreaterThan(terrain.cols * terrain.rows * 0.3);
  }, 30_000);
});

describe("editor terrain", () => {
  test("a grown landform becomes an editor terrain document that samples the same heights and materials", () => {
    const terrain = runGenerator(createLandformGenerator(createLandformCache(), { grower: null }), SMALL);
    const snapshot = landformTerrainSnapshot(terrain, { center: [100, -40], datum: 10 });
    expect(snapshot.cols).toBe(terrain.cols - 1);
    expect(snapshot.layers?.map((layer) => layer.surface)).toEqual(["rock", "gravel", "sand", "mud", "dirt"]);
    expect(snapshot.weights).toHaveLength(snapshot.cols * snapshot.rows * terrain.kinds.length);
    const live = editableTerrainFromSnapshot(snapshot);
    const { bounds, cellSize } = snapshot;
    for (const [col, row] of [
      [0, 0],
      [7, 30],
      [47, 47],
      [20, 11],
    ] as const) {
      const x = bounds.minX + col * cellSize;
      const z = bounds.minZ + row * cellSize;
      expect(live.sampleHeight(x, z)).toBeCloseTo((terrain.heights[row * terrain.cols + col] ?? 0) - 10, 3);
    }
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  }, 30_000);
});

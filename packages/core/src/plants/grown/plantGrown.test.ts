import { describe, expect, test } from "bun:test";

import { prepareGenerator, runGenerator } from "../../generator/generator";
import { parseParams } from "../../generator/paramSchema";
import { createMemoryPlantCacheStorage, createPlantCache } from "../cache/plantCache";
import { decodePlantMesh, decodePlantStructure, encodePlantMesh, encodePlantStructure } from "../cache/plantCodec";
import { OPEN_TEMPERATE_SITE } from "../growth/plantEnvironment";
import { createPlantGrowth } from "../growth/plantGrowth";
import { buildPlantMesh, DEFAULT_PLANT_STYLE, PLANT_MESH_LODS, PLANT_MESH_TRIANGLE_BUDGETS } from "../mesh/plantMesh";
import { ACER_SACCHARUM } from "../species/data/acerSaccharum";
import { PLANT_LIBRARY } from "../species/data/plantLibrary";
import { PINUS_STROBUS } from "../species/data/pinusStrobus";
import { hashPlantStructure } from "../structure/plantStructure";
import { createWorkerPlantGrower } from "./plantGrowPool";
import { createPlantGrownGenerator, PLANT_GROWN_SCHEMA, PLANT_MESH_OUTPUT } from "./plantGrown";

/** The three looks the milestone asks for, built only from style params. */
const REALISTIC = { foliage: "leaves", shading: "lit", barkGrain: true };
const TOON = { foliage: "clumps", shading: "ramp", rampBands: 3, rampSoftness: 0.1, saturation: 1.35, barkGrain: false };
const CLAY = { foliage: "clumps", shading: "lit", paint: 0.9, brightness: 1.05, colorJitter: 0.03, barkGrain: false, leafTint: "#e9d8c4", barkTint: "#cdb8a0" };

function fastest(run: () => void, times = 5): number {
  let best = Infinity;
  for (let i = 0; i < times; i += 1) {
    const start = performance.now();
    run();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

describe("plant mesh", () => {
  test("every library species is a species a scene can ask for", () => {
    for (const species of PLANT_LIBRARY) expect(parseParams(PLANT_GROWN_SCHEMA, { species: species.id }).species).toBe(species.id);
  });


  test("every level stays within its triangle budget at every age", () => {
    for (const species of [ACER_SACCHARUM, PINUS_STROBUS]) {
      const growth = createPlantGrowth(species, OPEN_TEMPERATE_SITE, "budget");
      for (const age of [2, 30, 150]) {
        growth.step(age - growth.ageYears());
        const structure = growth.structure();
        for (const foliage of ["leaves", "clumps"] as const) {
          PLANT_MESH_LODS.forEach((detail, lod) => {
            const mesh = buildPlantMesh({ structure, detail, style: { ...DEFAULT_PLANT_STYLE, foliage }, structureHash: "-" });
            expect(mesh.lod).toBe(lod);
            expect(mesh.triangles).toBeGreaterThan(0);
            expect(mesh.triangles).toBeLessThanOrEqual(PLANT_MESH_TRIANGLE_BUDGETS[lod] ?? 0);
          });
        }
      }
    }
  }, 60_000);

  test("lower levels draw fewer triangles", () => {
    const growth = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, "levels");
    growth.step(60);
    const structure = growth.structure();
    const counts = PLANT_MESH_LODS.map((detail) => buildPlantMesh({ structure, detail, structureHash: "-" }).triangles);
    for (let i = 1; i < counts.length; i += 1) expect(counts[i] ?? 0).toBeLessThan(counts[i - 1] ?? 0);
  });

  test("structures and meshes survive the byte codec", () => {
    const growth = createPlantGrowth(PINUS_STROBUS, OPEN_TEMPERATE_SITE, "codec");
    growth.step(25);
    const structure = growth.structure();
    const hash = hashPlantStructure(structure);
    const decoded = decodePlantStructure(encodePlantStructure(structure, hash));
    expect(decoded.hash).toBe(hash);
    expect(hashPlantStructure(decoded.structure)).toBe(hash);
    expect(decoded.structure.leafColor).toEqual(structure.leafColor);
    const mesh = buildPlantMesh({ structure, detail: 0.5, structureHash: hash });
    expect(decodePlantMesh(encodePlantMesh(mesh))).toEqual(mesh);
  });
});

describe("plant.grown", () => {
  const params = { species: "acer-saccharum", age: 40, seed: "oak-hill" };

  test("three styles of one plant share one grown structure", () => {
    const generator = createPlantGrownGenerator(createPlantCache());
    const [realistic, toon, clay] = [REALISTIC, TOON, CLAY].map((style) => runGenerator(generator, { ...params, ...style }));
    expect(realistic?.structureHash).toHaveLength(16);
    expect(toon?.structureHash).toBe(realistic?.structureHash ?? "");
    expect(clay?.structureHash).toBe(realistic?.structureHash ?? "");
    expect(realistic?.look.shading).toBe("lit");
    expect(toon?.look.shading).toBe("ramp");
    expect(clay?.leaves.colors).not.toEqual(toon?.leaves.colors);
  });

  test("restyling never regrows", () => {
    const cache = createPlantCache();
    const generator = createPlantGrownGenerator(cache);
    runGenerator(generator, { ...params, ...REALISTIC });
    const grown = cache.state().structures;
    runGenerator(generator, { ...params, ...TOON });
    runGenerator(generator, { ...params, ...CLAY });
    expect(cache.state().structures).toBe(grown);
    expect(cache.state().meshes).toBe(3);
  });

  test("a prepared plant returns from memory in under 5 ms", async () => {
    const generator = createPlantGrownGenerator(createPlantCache());
    await prepareGenerator(generator, params);
    expect(fastest(() => runGenerator(generator, params))).toBeLessThan(5);
  });

  test("a plant stored by an earlier session returns in under 5 ms", async () => {
    const storage = createMemoryPlantCacheStorage();
    const first = createPlantCache({ storage });
    await prepareGenerator(createPlantGrownGenerator(first), params);
    await first.flush();
    expect(storage.keys()).toHaveLength(2);
    let best = Infinity;
    for (let i = 0; i < 5; i += 1) {
      const generator = createPlantGrownGenerator(createPlantCache({ storage }));
      const start = performance.now();
      await prepareGenerator(generator, params);
      runGenerator(generator, params);
      best = Math.min(best, performance.now() - start);
    }
    expect(best).toBeLessThan(5);
  });

  test("generate without prepare grows on the spot and matches the prepared plant", async () => {
    const prepared = createPlantGrownGenerator(createPlantCache());
    await prepareGenerator(prepared, params);
    const direct = runGenerator(createPlantGrownGenerator(createPlantCache()), params);
    const fromCache = runGenerator(prepared, params);
    expect(direct.structureHash).toBe(fromCache.structureHash);
    expect(direct.triangles).toBe(fromCache.triangles);
  });

  test("detail picks the mesh level from one structure", () => {
    const generator = createPlantGrownGenerator(createPlantCache());
    expect(generator.output).toBe(PLANT_MESH_OUTPUT);
    const near = runGenerator(generator, { ...params, age: 20 }, { detail: 1 });
    const far = runGenerator(generator, { ...params, age: 20 }, { detail: 0.1 });
    expect(near.lod).toBe(0);
    expect(far.lod).toBe(3);
    expect(far.structureHash).toBe(near.structureHash);
  });
});

describe("plant grow workers", () => {
  test("a worker grows the same structure as the main thread", async () => {
    const grower = createWorkerPlantGrower({ workers: 2 });
    expect(grower).not.toBeNull();
    if (grower === null) return;
    try {
      const requests = [
        { species: ACER_SACCHARUM, env: OPEN_TEMPERATE_SITE, seed: "w1", age: 30, day: 200 },
        { species: PINUS_STROBUS, env: OPEN_TEMPERATE_SITE, seed: "w2", age: 20, day: 30 },
        { species: ACER_SACCHARUM, env: { ...OPEN_TEMPERATE_SITE, light: 0.4 }, seed: "w3", age: 12, day: 120 },
      ];
      const order = { style: DEFAULT_PLANT_STYLE, detail: 0.25 };
      const results = await Promise.all(requests.map((request, index) => grower.grow(request, index === 0 ? order : undefined)));
      requests.forEach((request, index) => {
        const growth = createPlantGrowth(request.species, request.env, request.seed);
        growth.step(request.age);
        const structure = growth.structure(request.day);
        const hash = hashPlantStructure(structure);
        const result = results[index];
        expect(result?.grown.hash).toBe(hash);
        expect(hashPlantStructure(result?.grown.structure ?? structure)).toBe(hash);
        if (index === 0) {
          // A mesh built in the worker is the mesh the main thread builds.
          const local = buildPlantMesh({ structure, style: order.style, detail: order.detail, structureHash: hash });
          const remote = result?.mesh;
          expect(remote).not.toBeNull();
          if (remote) expect(Buffer.from(encodePlantMesh(remote)).equals(Buffer.from(encodePlantMesh(local)))).toBe(true);
        } else {
          expect(result?.mesh).toBeNull();
        }
      });
      expect(grower.state()).toEqual({ queued: 0, running: 0, workers: 0 });
      const cancelled = grower.grow({ species: ACER_SACCHARUM, env: OPEN_TEMPERATE_SITE, seed: "w4", age: 40, day: 200 });
      grower.reset();
      await expect(cancelled).rejects.toThrow("reset");
      expect(grower.state()).toEqual({ queued: 0, running: 0, workers: 0 });
    } finally {
      grower.dispose();
    }
  }, 60_000);

  test("a generator whose grower fails grows on the main thread instead", async () => {
    const broken = { grow: () => Promise.reject(new Error("no workers here")), dispose: () => undefined };
    const generator = createPlantGrownGenerator(createPlantCache(), { grower: broken });
    await prepareGenerator(generator, { species: "acer-saccharum", age: 10, seed: "fallback" });
    const direct = runGenerator(createPlantGrownGenerator(createPlantCache(), { grower: null }), { species: "acer-saccharum", age: 10, seed: "fallback" });
    expect(runGenerator(generator, { species: "acer-saccharum", age: 10, seed: "fallback" }).structureHash).toBe(direct.structureHash);
  });
});

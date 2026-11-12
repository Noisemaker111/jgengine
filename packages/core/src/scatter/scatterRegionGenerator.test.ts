import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

import { bakeGeneratorVariants, generatorVariants, getGenerator, runGenerator } from "../generator/generator";
import { validateParams } from "../generator/paramSchema";
import { registerBuiltinSceneKinds } from "../scene/builtinSceneKinds";
import { getSceneKind } from "../scene/sceneKinds";
import type { TerrainNormal } from "../terrain/terrain";
import { resolveScatter, SCATTER_GENERATOR, SCATTER_PLOT_SIZE, SCATTER_SCHEMA, type ScatterTerrain } from "./scatterRegion";

const fingerprint = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

const BASE = { palette: [{ item: "pine", weight: 2 }, { item: "fern", weight: 1 }], density: 0.4, minSpacing: 0.8, maxScale: 1.8 };

describe("scatter generator", () => {
  test("is registered and named by the scatter scene kind", () => {
    registerBuiltinSceneKinds();
    expect(getGenerator("scatter")?.output).toBe("scatter-plot");
    expect(getSceneKind("scatter")?.generator).toBe(SCATTER_GENERATOR.id);
    expect(getSceneKind("scatter")?.schema).toBe(SCATTER_SCHEMA);
  });

  test("grows a byte-identical plot from the same params and seed", () => {
    const a = runGenerator(SCATTER_GENERATOR, { ...BASE, seed: "oak" });
    const b = runGenerator(SCATTER_GENERATOR, { ...BASE, seed: "oak" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.size).toBe(SCATTER_PLOT_SIZE);
    expect(a.instances.length).toBeGreaterThan(50);
    const half = SCATTER_PLOT_SIZE / 2;
    expect(a.instances.every((instance) => Math.abs(instance.x) <= half && Math.abs(instance.z) <= half)).toBe(true);
    expect(new Set(a.instances.map((instance) => instance.item))).toEqual(new Set(["pine", "fern"]));
  });

  test("different seeds grow different plots", () => {
    const a = runGenerator(SCATTER_GENERATOR, { ...BASE, seed: "oak" });
    const b = runGenerator(SCATTER_GENERATOR, { ...BASE, seed: "ash" });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  test("a stored variant meta round-trips through JSON and regrows the same plot", () => {
    const baked = bakeGeneratorVariants(SCATTER_GENERATOR, BASE, { count: 4 });
    expect(new Set(baked.map((entry) => entry.variant.seed)).size).toBe(4);
    for (const entry of baked) {
      expect(validateParams(SCATTER_SCHEMA, entry.variant.meta)).toEqual([]);
      const stored: Record<string, unknown> = JSON.parse(JSON.stringify(entry.variant.meta));
      expect(JSON.stringify(runGenerator(SCATTER_GENERATOR, stored))).toBe(JSON.stringify(entry.lods[0]?.output));
    }
    expect(generatorVariants(SCATTER_GENERATOR, BASE, { count: 4 }).map((variant) => variant.meta)).toEqual(baked.map((entry) => entry.variant.meta));
  });
});

const hilly: ScatterTerrain = {
  sampleHeight: (x, z) => Math.sin(x * 0.05) * 6 + Math.cos(z * 0.07) * 4,
  sampleNormal: (x, z): TerrainNormal => {
    const dx = Math.cos(x * 0.05) * 0.3;
    const dz = -Math.sin(z * 0.07) * 0.28;
    const len = Math.hypot(dx, 1, dz);
    return [-dx / len, 1 / len, -dz / len];
  },
};

const square = (half: number) => [
  { x: -half, y: 0, z: -half },
  { x: half, y: 0, z: -half },
  { x: half, y: 0, z: half },
  { x: -half, y: 0, z: half },
];

const fieldDoc = () => ({
  markers: [{ id: "spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } }],
  volumes: [],
  paths: [
    { id: "road", kind: "road", width: 6, points: [{ x: -40, y: 0, z: 5 }, { x: 40, y: 0, z: 5 }] },
    {
      id: "all-knobs",
      kind: "scatter",
      points: square(30),
      meta: {
        density: 0.4, minSpacing: 0.8, seed: "fp", minScale: 0.5, maxScale: 2, minYaw: 0.2, maxYaw: 1.4,
        verticalOffset: 0.3, alignToNormal: true, maxSlope: 0.25, minHeight: -5, maxHeight: 5, edgeFalloff: 4,
        jitter: 0.6, palette: [{ item: "pine", weight: 2 }, { item: "fern", weight: 1 }], avoid: [{ x: 10, z: -10, radius: 4, feather: 1 }],
      },
    },
  ],
  annotations: [],
});

describe("scatter regions on the generator contract", () => {
  test("a region using every knob places exactly what the pre-contract reader placed", () => {
    // Recorded from the ad-hoc meta reader before scatter moved onto SCATTER_SCHEMA (origin/beta ce992579b).
    expect(fingerprint(resolveScatter(fieldDoc(), hilly))).toBe("e44e444fd7052ad6");
  });

  test("a document's resolved field is cached and matches a fresh resolve", () => {
    const doc = fieldDoc();
    const first = resolveScatter(doc, hilly);
    expect(resolveScatter(doc, hilly)).toBe(first);
    expect(JSON.stringify(resolveScatter(JSON.parse(JSON.stringify(doc)), hilly))).toBe(JSON.stringify(first));
  });
});

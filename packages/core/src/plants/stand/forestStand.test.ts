import { describe, expect, test } from "bun:test";

import { resolveScatter } from "../../scatter/scatterRegion";
import { registerBuiltinSceneKinds } from "../../scene/builtinSceneKinds";
import { getSceneKind } from "../../scene/sceneKinds";
import type { ScenePathLike } from "../../world/sceneShapes";
import { FOREST_STAND_KIND, growForestStandPlot, readForestStandParams, resolveForestStand } from "./forestStand";

const SQUARE = [{ x: 0, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }, { x: 60, y: 0, z: 60 }, { x: 0, y: 0, z: 60 }];

function stand(meta: Record<string, unknown>, id = "pines"): ScenePathLike {
  return { id, kind: FOREST_STAND_KIND, points: SQUARE, meta: { plotM: 30, ageYears: 40, ...meta } };
}

describe("forest stand scene kind", () => {
  test("a scene with a forest stand loads twice to the same placements", () => {
    const doc = () => ({ markers: [], paths: [stand({ species: [{ item: "pinus-resinosa", weight: 2 }, { item: "betula-papyrifera", weight: 1 }] })], volumes: [] });
    registerBuiltinSceneKinds();
    const a = resolveScatter(doc());
    const b = resolveScatter(doc());
    expect(a.length).toBeGreaterThan(50);
    expect(b).toEqual(a);
    expect(new Set(a.map((tree) => tree.item))).toEqual(new Set(["pinus-resinosa", "betula-papyrifera"]));
    expect(getSceneKind(FOREST_STAND_KIND)?.target).toBe("path");
  }, 30_000);

  test("trees stay inside the drawn polygon, out of clearance discs, and scale with their grown height", () => {
    const trees = resolveForestStand(stand({}), { sampleHeight: () => 3, sampleNormal: () => [0, 1, 0] }, { discs: [{ x: 30, z: 30, radius: 8, feather: 0 }], corridors: [] });
    expect(trees.length).toBeGreaterThan(0);
    for (const tree of trees) {
      expect(tree.x).toBeGreaterThanOrEqual(0);
      expect(tree.x).toBeLessThanOrEqual(60);
      expect(Math.hypot(tree.x - 30, tree.z - 30)).toBeGreaterThan(8);
      expect(tree.y).toBe(3);
      expect(Number.isFinite(tree.scale) && tree.scale > 0).toBe(true);
    }
  }, 30_000);

  test("self-thinning dial: stand density is finite, bounded by the planting and monotone over 0..4", () => {
    const density = [0, 0.2, 1, 2, 4].map((selfThinning) => growForestStandPlot({ ...readForestStandParams(stand({ selfThinning, plantedPerHa: 3000, ageYears: 60 })), seed: "dial" }).treesPerHa);
    expect(density[0] ?? 0).toBeLessThanOrEqual(3000);
    for (let k = 1; k < density.length; k += 1) {
      expect(Number.isFinite(density[k] ?? Number.NaN)).toBe(true);
      expect(density[k] ?? 0).toBeLessThan(density[k - 1] ?? 0);
      expect(density[k] ?? 0).toBeGreaterThan(0);
    }
  }, 60_000);
});

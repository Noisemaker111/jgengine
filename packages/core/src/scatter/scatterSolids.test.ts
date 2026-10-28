import { describe, expect, test } from "bun:test";

import { createWorldSolids } from "../world/worldSolids";
import type { ScatterInstance } from "./scatterRegion";
import { SCATTER_SOLID_LAYER, scatterSolids, syncScatterSolids } from "./scatterSolids";

const placed = (id: string, item: string, x: number, scale = 1): ScatterInstance => ({ id, regionId: "beach", item, x, y: 2, z: 0, rotationY: 0, scale });

describe("scatterSolids", () => {
  test("listed items block with a box scaled by the placement; others stay walk-through", () => {
    const solids = scatterSolids([placed("a", "boulder", 0, 2), placed("b", "pebble", 5)], { boulder: { radius: 1.5, height: 2 } });
    expect(solids).toEqual([{ center: [0, 4, 0], halfExtents: [3, 2, 3] }]);
  });

  test("a hidden placement stops blocking", () => {
    const solids = scatterSolids([placed("a", "boulder", 0), placed("b", "boulder", 10)], { boulder: { radius: 1, height: 1 } }, new Set(["a"]));
    expect(solids.map((solid) => solid.center[0])).toEqual([10]);
  });

  test("sync writes one layer the movement query sees, and an empty sync removes it", () => {
    const world = createWorldSolids();
    syncScatterSolids(world, [placed("a", "boulder", 0)], { boulder: { radius: 1, height: 2 } });
    expect(world.layer(SCATTER_SOLID_LAYER)).toHaveLength(1);
    expect(world.inBox([-0.5, 2, -0.5], [0.5, 3, 0.5])).toHaveLength(1);
    syncScatterSolids(world, [], {});
    expect(world.layers()).not.toContain(SCATTER_SOLID_LAYER);
  });
});

import { describe, expect, test } from "bun:test";

import { biomes, plots, tilemap, voxel } from "./features";
import { resolveGridCells, resolveGridInstances } from "./gridInstances";

describe("resolveGridInstances", () => {
  test("empty cells yields no instances", () => {
    expect(resolveGridInstances({})).toEqual([]);
    expect(resolveGridInstances({ cells: [] })).toEqual([]);
  });

  test("defaults cell size 1, height 1, and a fallback color", () => {
    const [instance] = resolveGridInstances({ cells: [{ x: 2, z: 3 }] });
    expect(instance).toEqual({
      position: [2, 0.5, 3],
      scale: [1, 1, 1],
      color: "#8a8f98",
    });
  });

  test("per-cell height and color win over config defaults", () => {
    const [instance] = resolveGridInstances({
      cells: [{ x: 0, z: 0, height: 4, color: "#ff0000" }],
      baseHeight: 1,
      defaultColor: "#00ff00",
    });
    expect(instance).toEqual({
      position: [0, 2, 0],
      scale: [1, 4, 1],
      color: "#ff0000",
    });
  });

  test("baseHeight and defaultColor apply when a cell omits its own", () => {
    const [instance] = resolveGridInstances({
      cells: [{ x: 1, z: -1 }],
      baseHeight: 3,
      defaultColor: "#123456",
      cellSize: 2,
    });
    expect(instance).toEqual({
      position: [2, 1.5, -2],
      scale: [2, 3, 2],
      color: "#123456",
    });
  });

  test("cellSize scales both position spacing and box footprint", () => {
    const instances = resolveGridInstances({
      cells: [
        { x: 0, z: 0 },
        { x: 1, z: 2 },
      ],
      cellSize: 4,
    });
    expect(instances[0]?.position).toEqual([0, 0.5, 0]);
    expect(instances[1]?.position).toEqual([4, 0.5, 8]);
    expect(instances[1]?.scale).toEqual([4, 1, 4]);
  });
});

describe("resolveGridCells source resolution", () => {
  test("tilemap parses inline ASCII into cells", () => {
    const feature = tilemap({
      map: `
##
#.#
`,
    });
    const cells = resolveGridCells(feature);
    expect(cells.length).toBe(4);
    expect(resolveGridInstances(feature).length).toBe(4);
  });

  test("tilemap digit glyphs set height", () => {
    const cells = resolveGridCells(tilemap({ map: "3" }));
    expect(cells).toEqual([{ x: 0, z: 0, height: 3 }]);
  });

  test("tilemap asset-path maps throw instead of rendering empty", () => {
    expect(() => resolveGridCells(tilemap({ map: "./level.ts" }))).toThrow(/asset path/);
  });

  test("biomes resolves map+zones into colored cells", () => {
    const feature = biomes({
      map: "#.",
      zones: JSON.stringify({ "#": { height: 2, color: "#4a7c59" } }),
    });
    const cells = resolveGridCells(feature);
    expect(cells).toEqual([{ x: 0, z: 0, height: 2, color: "#4a7c59" }]);
    expect(resolveGridInstances(feature)[0]?.color).toBe("#4a7c59");
  });

  test("biomes asset-path sources throw", () => {
    expect(() =>
      resolveGridCells(biomes({ map: "./biomes.ts", zones: "./zones.ts" })),
    ).toThrow(/asset path/);
  });

  test("voxel seed generates a non-empty deterministic cell set", () => {
    const a = resolveGridCells(voxel({ seed: "world-a" }));
    const b = resolveGridCells(voxel({ seed: "world-a" }));
    const c = resolveGridCells(voxel({ seed: "world-b" }));
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(resolveGridInstances(voxel({ seed: "world-a" })).length).toBe(a.length);
  });

  test("plots with city/interiors and no cells throws", () => {
    expect(() => resolveGridCells(plots({ city: "./city.ts" }))).toThrow(/explicit cells/);
  });

  test("empty plots without sources stays empty", () => {
    expect(resolveGridCells(plots())).toEqual([]);
    expect(resolveGridInstances(plots())).toEqual([]);
  });

  test("explicit cells win over source fields", () => {
    const cells = [{ x: 9, z: 9, height: 5, color: "#ffffff" }];
    expect(resolveGridCells(tilemap({ map: "./level.ts", cells }))).toEqual(cells);
    expect(resolveGridCells(voxel({ seed: "x", cells }))).toEqual(cells);
    expect(resolveGridCells(biomes({ map: "./a.ts", zones: "./b.ts", cells }))).toEqual(cells);
    expect(resolveGridCells(plots({ city: "./city.ts", cells }))).toEqual(cells);
  });
});

import { describe, expect, test } from "bun:test";

import {
  BUILDING_STYLE_PALETTES,
  buildingSurfaceColor,
  createBuildingConfig,
  createBuildingGrid,
  generateBuilding,
  generateBuildingDistrict,
  resolveBuildingPalette,
  resolveBuildingSurface,
} from "./buildings";

describe("building palettes", () => {
  test("resolveBuildingPalette resolves style presets and per-part overrides", () => {
    expect(resolveBuildingPalette()).toEqual(BUILDING_STYLE_PALETTES.generic);
    expect(resolveBuildingPalette("desert")).toEqual(BUILDING_STYLE_PALETTES.desert);
    expect(resolveBuildingPalette("capital", { wall: "#111111" })).toEqual({
      ...BUILDING_STYLE_PALETTES.capital,
      wall: "#111111",
    });
  });

  test("resolveBuildingPalette rejects unknown styles instead of silently falling back", () => {
    expect(() => resolveBuildingPalette("tents" as never)).toThrow(/Unknown building style "tents"/);
    expect(() => resolveBuildingPalette("aerodrome" as never)).toThrow(/Valid styles:/);
  });

  test("a palette part may be a textured surface, and colour readers still see a hex", () => {
    const wall = { color: "#d9cbb0", maps: { color: "/materials/plaster/color.jpg" }, repeat: [2, 1.5] as const };
    const palette = resolveBuildingPalette("coastal", { wall });
    expect(palette.wall).toBe(wall);
    expect(buildingSurfaceColor(palette.wall)).toBe("#d9cbb0");
    expect(buildingSurfaceColor({ maps: {} }, "#123456")).toBe("#123456");
    expect(buildingSurfaceColor(undefined, "#abcdef")).toBe("#abcdef");
    expect(resolveBuildingSurface("#ffffff")).toEqual({ color: "#ffffff" });
    expect(resolveBuildingSurface(wall)).toBe(wall);
  });

  test("every building style palette has a distinct wall color", () => {
    const walls = Object.values(BUILDING_STYLE_PALETTES).map((palette) => palette.wall);
    expect(new Set(walls).size).toBe(walls.length);
  });
});

describe("buildings", () => {
  test("normalizes configurable building inputs", () => {
    const config = createBuildingConfig({
      floors: 0,
      baysWide: -4,
      bayWidth: -1,
      probabilities: { window: 2, roofProp: -1 },
      variants: { wall: 0 },
    });
    expect(config.floors).toBe(1);
    expect(config.baysWide).toBe(1);
    expect(config.bayWidth).toBe(2);
    expect(config.probabilities.window).toBe(1);
    expect(config.probabilities.roofProp).toBe(0);
    expect(config.variants.wall).toBe(1);
  });

  test("generates deterministic serializable placements from a seed", () => {
    const first = generateBuilding({ id: "tower", seed: "abc", floors: 4, baysWide: 3, baysDeep: 2 });
    const second = generateBuilding({ id: "tower", seed: "abc", floors: 4, baysWide: 3, baysDeep: 2 });
    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  test("changes optional facade details when the seed changes", () => {
    const base = { floors: 5, baysWide: 4, baysDeep: 2 };
    const first = generateBuilding({ ...base, seed: "one" });
    const second = generateBuilding({ ...base, seed: "two" });
    expect(first.parts.map((part) => `${part.id}:${part.kit.variant}`)).not.toEqual(
      second.parts.map((part) => `${part.id}:${part.kit.variant}`),
    );
  });

  test("uses facade dimensions for bounds and roof output", () => {
    const building = generateBuilding({
      center: [10, -5],
      floors: 3,
      baysWide: 4,
      baysDeep: 2,
      bayWidth: 2,
      roofOverhang: 0.5,
      probabilities: { roofProp: 0 },
    });
    expect(building.bounds).toEqual({ minX: 5.5, maxX: 14.5, minZ: -7.5, maxZ: -2.5 });
    expect(building.parts.some((part) => part.kind === "roof")).toBe(true);
    expect(building.parts.every((part) => part.position.length === 3)).toBe(true);
  });

  test("creates a seeded district grid", () => {
    const lots = createBuildingGrid({
      rows: 2,
      columns: 2,
      origin: [1, 2],
      lotSize: { w: 8, d: 6 },
      streetWidth: 3,
      seed: "district",
      floorRange: [2, 4],
    });
    expect(lots.map((lot) => lot.center)).toEqual([
      [1, 2],
      [12, 2],
      [1, 11],
      [12, 11],
    ]);
    expect(lots.every((lot) => lot.config.floors >= 2 && lot.config.floors <= 4)).toBe(true);
    expect(generateBuildingDistrict({ rows: 1, columns: 2, seed: "district" })).toHaveLength(2);
  });
});

describe("open storefronts are backed, not holes", () => {
  test("every open-store bay also emits a wall behind the glass", () => {
    // Storefront and window materials render translucent, and a generated building is a hollow
    // shell — an unbacked bay is a hole straight through to the world beyond.
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const building = generateBuilding({
        id: `shop-${seed}`,
        seed,
        floors: 2,
        baysWide: 4,
        baysDeep: 3,
        probabilities: { openStore: 1 },
      });
      const stores = building.parts.filter((part) => part.kind === "storefront");
      expect(stores.length).toBeGreaterThan(0);
      for (const store of stores) {
        const backing = building.parts.find(
          (part) =>
            part.kind === "wall" &&
            part.cell.facade === store.cell.facade &&
            part.cell.level === store.cell.level &&
            part.cell.bay === store.cell.bay,
        );
        expect(backing).toBeDefined();
      }
    }
  });
});

describe("facade panels leave no see-through slits", () => {
  test("structural panels tile each bay with no gap at the seams", () => {
    // Buildings are a shell of thin panels with no solid core, so an undersized structural panel
    // opens a continuous slit you can see through the building and out the far side.
    const building = generateBuilding({
      id: "solid",
      seed: "slit",
      floors: 3,
      baysWide: 4,
      baysDeep: 3,
      bayWidth: 2,
    });
    const structural = building.parts.filter(
      (part) => part.tags?.includes("structure") === true || part.kind === "shutter",
    );
    const front = structural
      .filter((part) => part.facade === "front")
      .map((part) => ({
        x0: part.position[0] - part.scale[0] / 2,
        x1: part.position[0] + part.scale[0] / 2,
        y: Math.round(part.position[1] * 100) / 100,
      }));
    expect(front.length).toBeGreaterThan(0);

    for (const level of new Set(front.map((panel) => panel.y))) {
      const row = front.filter((panel) => panel.y === level).sort((a, b) => a.x0 - b.x0);
      for (let index = 1; index < row.length; index += 1) {
        expect(row[index]!.x0 - row[index - 1]!.x1).toBeLessThan(0.001);
      }
    }
  });
});

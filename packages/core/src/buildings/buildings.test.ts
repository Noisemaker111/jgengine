import { describe, expect, test } from "bun:test";

import {
  BUILDING_STYLE_PALETTES,
  buildingSurfaceColor,
  createBuildingConfig,
  GABLE_PITCH,
  generateBuilding,
  resolveBuildingPalette,
  resolveBuildingSurface,
} from "./buildings";
import { building } from "../world/features";
import { resolveStructureBuildings } from "../world/environmentSummary";

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

});

describe("house ground floors", () => {
  test("a house has a front door on a porch step, a garage door on a wide front and windows in every other bay", () => {
    const house = generateBuilding({ center: [0, 0], floors: 2, baysWide: 3, baysDeep: 2, ground: "house", probabilities: { window: 0, openStore: 1 } });
    const ground = house.parts.filter((part) => part.cell?.level === 0);
    const front = ground.filter((part) => part.facade === "front");
    expect(front.filter((part) => part.id.endsWith(":door:shutter"))).toHaveLength(1);
    expect(front.filter((part) => part.id.endsWith(":garage:shutter"))).toHaveLength(1);
    const step = front.find((part) => part.id.endsWith(":step:corner"));
    expect(step?.position[1]).toBeLessThan(0.2);
    expect(step!.position[2]).toBeGreaterThan(front.find((part) => part.id.endsWith(":door:shutter"))!.position[2]);
    // No shopfronts, whatever the shop probabilities say; windows round the sides and upstairs.
    expect(house.parts.some((part) => part.kind === "storefront" || part.kind === "storeSign")).toBe(false);
    expect(ground.filter((part) => part.kind === "window").length).toBe(1 + 3 + 2 + 2);
    expect(house.parts.filter((part) => part.cell?.level === 1 && part.kind === "window")).toHaveLength(3 + 3 + 2 + 2);
    // Every ground bay is still backed by a full wall panel.
    expect(ground.filter((part) => part.kind === "wall")).toHaveLength(10);
  });

  test("a narrow house skips the garage, and shop stays the default ground floor", () => {
    const narrow = generateBuilding({ center: [0, 0], floors: 1, baysWide: 2, baysDeep: 2, ground: "house" });
    expect(narrow.parts.some((part) => part.id.endsWith(":garage:shutter"))).toBe(false);
    const shop = generateBuilding({ center: [0, 0], floors: 1, baysWide: 3, baysDeep: 2 });
    expect(shop.parts.some((part) => part.id.endsWith(":door:shutter"))).toBe(false);
  });
});

describe("gable roofs", () => {
  test("a gable roof is two slabs pitched down to the front and back eaves, over closed gable ends", () => {
    const config = { center: [0, 0] as const, floors: 1, baysWide: 3, baysDeep: 2, bayWidth: 2, floorHeight: 3, probabilities: { roofProp: 1 } };
    const gable = generateBuilding({ ...config, roof: "gable" });
    const slabs = gable.parts.filter((part) => part.kind === "roof");
    expect(slabs.map((part) => part.pitch).sort()).toEqual([-GABLE_PITCH, GABLE_PITCH].sort());
    // Each slab runs from the ridge to past its eave, so the two together cover the footprint.
    for (const slab of slabs) expect(Math.abs(slab.position[2])).toBeGreaterThan(0.5);
    // A pitched roof carries no parapet rail and no rooftop clutter; its gable ends step up under the slope.
    expect(gable.parts.some((part) => part.kind === "guardrail" || part.kind === "roofProp")).toBe(false);
    const ends = gable.parts.filter((part) => part.facade === "roof" && part.kind === "wall");
    expect(ends).toHaveLength(6);
    expect(Math.max(...ends.map((part) => part.position[1]))).toBeGreaterThan(3);
  });

  test("a gable building() descriptor pitches every house it places", () => {
    const houses = resolveStructureBuildings(building({ count: 4, position: [0, 0], footprint: { w: 6, d: 6 }, stories: [1, 1], roof: "gable" }));
    expect(houses.length).toBe(4);
    for (const house of houses) expect(house.parts.filter((part) => part.pitch !== undefined)).toHaveLength(2);
  });

  test("flat stays the default: one level slab, its rail and its clutter", () => {
    const flat = generateBuilding({ center: [0, 0], floors: 1, baysWide: 3, baysDeep: 2, probabilities: { roofProp: 1 } });
    const slabs = flat.parts.filter((part) => part.kind === "roof");
    expect(slabs).toHaveLength(1);
    expect(slabs[0]!.pitch).toBeUndefined();
    expect(flat.parts.some((part) => part.kind === "roofProp")).toBe(true);
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

import { describe, expect, test } from "bun:test";
import { createLodScheduler } from "@jgengine/core/world/lod";
import { createModelVariantSelector, DEFAULT_VARIANT_HYSTERESIS } from "@jgengine/core/world/modelLod";

const PALM = {
  levels: [
    { url: "mainsail-palm.glb", maxDistance: 60 },
    { url: "mainsail-palm-lod1.glb" },
  ],
};

function levels(index: number): string {
  return PALM.levels[index]!.url;
}

describe("model variant selector", () => {
  test("near instances take the full mesh and far ones the decimated level", () => {
    const selector = createModelVariantSelector(PALM);
    expect(levels(selector.level("near", 20))).toBe("mainsail-palm.glb");
    expect(levels(selector.level("far", 200))).toBe("mainsail-palm-lod1.glb");
    expect(selector.levels().map((level) => level.maxDistance)).toEqual([60, Infinity]);
    expect(selector.size()).toBe(2);
  });

  test("hysteresis keeps an instance on its level until it clears the boundary band", () => {
    const selector = createModelVariantSelector(PALM);
    const id = "palm";
    expect(selector.level(id, 59)).toBe(0);
    expect(selector.level(id, 61)).toBe(0);
    expect(selector.level(id, 60 + DEFAULT_VARIANT_HYSTERESIS)).toBe(0);
    expect(selector.level(id, 60 + DEFAULT_VARIANT_HYSTERESIS + 0.01)).toBe(1);
    expect(selector.level(id, 58)).toBe(1);
    expect(selector.level(id, 60 - DEFAULT_VARIANT_HYSTERESIS + 0.01)).toBe(1);
    expect(selector.level(id, 60 - DEFAULT_VARIANT_HYSTERESIS)).toBe(0);
    expect(selector.level(id, 59)).toBe(0);
  });

  test("swinging across the boundary without clearing the band never switches", () => {
    const selector = createModelVariantSelector({ ...PALM, hysteresis: 10 });
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(selector.level("palm", 55 + (i % 11)));
    expect([...seen]).toEqual([0]);
  });

  test("the mesh level and the simulation band read one distance authority", () => {
    const selector = createModelVariantSelector(PALM);
    const scheduler = createLodScheduler({ bands: selector.bands() });
    for (const distance of [0, 12, 59.9, 60, 60.5, 120, 5000]) {
      const band = scheduler.bandIndex(distance);
      expect(selector.level(`fresh-${distance}`, distance)).toBe(band === -1 ? 1 : band);
    }
    expect(selector.bands().map((band) => band.maxDistance)).toEqual([60, Infinity]);
  });

  test("state survives a snapshot and restore, and forgetting drops an id", () => {
    const a = createModelVariantSelector({ ...PALM, hysteresis: 10 });
    expect(a.level("far", 200)).toBe(1);
    const b = createModelVariantSelector({ ...PALM, hysteresis: 10 });
    b.restore(a.snapshot());
    expect(b.snapshot()).toEqual(a.snapshot());
    expect(b.level("far", 58)).toBe(1);
    a.forget("far");
    expect(a.size()).toBe(0);
  });

  test("malformed level lists are rejected before any draw", () => {
    expect(() => createModelVariantSelector({ levels: [{ url: "a.glb", maxDistance: 60 }] })).toThrow(/at least two levels/);
    expect(() => createModelVariantSelector({ levels: [{ url: "a.glb", maxDistance: 60 }, { url: "", maxDistance: 90 }, { url: "c.glb" }] })).toThrow(/level 1 needs a url/);
    expect(() => createModelVariantSelector({ levels: [{ url: "a.glb" }, { url: "b.glb" }] })).toThrow(/level 0 needs a finite maxDistance/);
    expect(() => createModelVariantSelector({ levels: [{ url: "a.glb", maxDistance: 60 }, { url: "b.glb", maxDistance: 40 }, { url: "c.glb" }] })).toThrow(/level 1 needs a finite maxDistance/);
    expect(() => createModelVariantSelector({ levels: [{ url: "a.glb", maxDistance: 60 }, { url: "b.glb", maxDistance: 90 }] })).toThrow(/last model variant level/);
  });
});

import { describe, expect, test } from "bun:test";

import type { EditorVolume } from "../editor/types";
import {
  grassPatchesFromVegetation,
  readVegetationSettings,
  resolveVegetation,
  resolveVegetationVolume,
  vegetationFootprint,
} from "./vegetation";

const boxVolume = (meta?: Record<string, unknown>): EditorVolume => ({
  id: "veg1",
  kind: "vegetation",
  shape: "box",
  center: { x: 10, y: 0, z: -20 },
  halfExtents: { x: 10, y: 2, z: 5 },
  ...(meta === undefined ? {} : { meta }),
});

describe("readVegetationSettings", () => {
  test("fills defaults for a bare vegetation volume", () => {
    const settings = readVegetationSettings(boxVolume());
    expect(settings).toEqual({
      item: "grass",
      density: 4,
      minScale: 0.8,
      maxScale: 1.2,
      minDistance: 0,
      seed: "",
    });
  });

  test("returns null for non-vegetation volumes", () => {
    expect(readVegetationSettings({ ...boxVolume(), kind: "zone" })).toBeNull();
  });

  test("clamps negative density to zero", () => {
    expect(readVegetationSettings(boxVolume({ density: -3 }))?.density).toBe(0);
  });
});

describe("resolveVegetationVolume", () => {
  test("density drives the placement count over the footprint area", () => {
    const sparse = resolveVegetationVolume(boxVolume({ item: "tree", density: 0.05 }));
    const dense = resolveVegetationVolume(boxVolume({ item: "tree", density: 0.5 }));
    expect(sparse.length).toBe(Math.floor(20 * 10 * 0.05));
    expect(dense.length).toBe(Math.floor(20 * 10 * 0.5));
    for (const placement of dense) {
      expect(placement.x).toBeGreaterThanOrEqual(0);
      expect(placement.x).toBeLessThanOrEqual(20);
      expect(placement.z).toBeGreaterThanOrEqual(-25);
      expect(placement.z).toBeLessThanOrEqual(-15);
      expect(placement.scale).toBeGreaterThanOrEqual(0.8);
      expect(placement.scale).toBeLessThanOrEqual(1.2);
      expect(placement.item).toBe("tree");
    }
  });

  test("is deterministic for the same volume and reseeds on demand", () => {
    const a = resolveVegetationVolume(boxVolume({ item: "bush", density: 0.3 }));
    const b = resolveVegetationVolume(boxVolume({ item: "bush", density: 0.3 }));
    const reseeded = resolveVegetationVolume(boxVolume({ item: "bush", density: 0.3, seed: "v2" }));
    expect(a).toEqual(b);
    expect(reseeded).not.toEqual(a);
  });

  test("clips sphere volumes to their radius", () => {
    const volume: EditorVolume = {
      id: "veg2",
      kind: "vegetation",
      shape: "sphere",
      center: { x: 0, y: 0, z: 0 },
      radius: 8,
      meta: { item: "rock", density: 0.4 },
    };
    for (const placement of resolveVegetationVolume(volume)) {
      expect(placement.x * placement.x + placement.z * placement.z).toBeLessThanOrEqual(64);
    }
  });
});

describe("document-level resolution", () => {
  const doc = {
    version: 1 as const,
    markers: [],
    volumes: [
      boxVolume({ item: "grass", density: 6 }),
      { ...boxVolume({ item: "tree", density: 0.1 }), id: "veg-trees" },
      { ...boxVolume(), id: "not-veg", kind: "zone" },
    ],
    paths: [],
    annotations: [],
  };

  test("resolveVegetation returns model items only", () => {
    const placements = resolveVegetation(doc);
    expect(placements.length).toBeGreaterThan(0);
    expect(placements.every((placement) => placement.item === "tree")).toBe(true);
  });

  test("grassPatchesFromVegetation maps grass volumes to environment patches", () => {
    const patches = grassPatchesFromVegetation(doc);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({
      area: { w: 20, d: 10, position: [10, -20] },
      density: 6,
      seed: "veg1:",
    });
  });
});

describe("vegetationFootprint", () => {
  test("uses radius for non-box shapes", () => {
    const volume: EditorVolume = {
      id: "v",
      kind: "vegetation",
      shape: "cylinder",
      center: { x: 5, y: 0, z: 5 },
      radius: 3,
    };
    expect(vegetationFootprint(volume)).toEqual({ minX: 2, minZ: 2, maxX: 8, maxZ: 8 });
  });
});

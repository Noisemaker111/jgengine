import { describe, expect, test } from "bun:test";

import { brushWeight, createEditableTerrain, createTerraformBrush } from "./terraform";
import { flatField, noiseField } from "./terrain";

const bounds = { minX: -16, minZ: -16, maxX: 16, maxZ: 16 };

describe("terraform brushWeight", () => {
  test("peaks at the center and zeroes past the radius", () => {
    expect(brushWeight(0, 4, "smooth")).toBe(1);
    expect(brushWeight(4, 4, "smooth")).toBe(0);
    expect(brushWeight(2, 4, "linear")).toBeCloseTo(0.5);
    expect(brushWeight(2, 4, "none")).toBe(1);
  });
});

describe("editable terrain write-back", () => {
  test("raise lifts the height under the cursor above the base field", () => {
    const terrain = createEditableTerrain({ bounds, base: flatField(), cellSize: 1 });
    const before = terrain.sampleHeight(0, 0);
    terrain.apply({ mode: "raise", center: [0, 0], radius: 4, strength: 2 });
    expect(terrain.sampleHeight(0, 0)).toBeGreaterThan(before);
    expect(terrain.sampleHeight(0, 0)).toBeGreaterThan(terrain.sampleHeight(3.5, 0));
  });

  test("lower digs below the base field", () => {
    const terrain = createEditableTerrain({ bounds, cellSize: 1 });
    terrain.apply({ mode: "lower", center: [0, 0], radius: 4, strength: 2 });
    expect(terrain.sampleHeight(0, 0)).toBeLessThan(0);
  });

  test("flatten drives the region toward a target height", () => {
    const terrain = createEditableTerrain({ bounds, base: noiseField({ amplitude: 4 }), cellSize: 1 });
    for (let i = 0; i < 8; i += 1) terrain.apply({ mode: "flatten", center: [0, 0], radius: 5, strength: 1, target: 2 });
    expect(terrain.sampleHeight(0, 0)).toBeCloseTo(2, 1);
  });

  test("paint writes a surface id readable under the cursor", () => {
    const terrain = createEditableTerrain({ bounds, cellSize: 1 });
    expect(terrain.surfaceAt(0, 0)).toBeNull();
    terrain.apply({ mode: "paint", center: [0, 0], radius: 2, surface: "path" });
    expect(terrain.surfaceAt(0, 0)).toBe("path");
    expect(terrain.surfaceAt(10, 10)).toBeNull();
  });

  test("snapshot and restore round-trip the edits", () => {
    const terrain = createEditableTerrain({ bounds, cellSize: 1 });
    terrain.apply({ mode: "raise", center: [2, 2], radius: 3, strength: 3 });
    terrain.apply({ mode: "paint", center: [2, 2], radius: 2, surface: "stone" });
    const snap = terrain.snapshot();

    const restored = createEditableTerrain({ bounds, cellSize: 1 });
    restored.restore(snap);
    expect(restored.sampleHeight(2, 2)).toBeCloseTo(terrain.sampleHeight(2, 2));
    expect(restored.surfaceAt(2, 2)).toBe("stone");
  });

  test("reset clears all edits back to the base field", () => {
    const terrain = createEditableTerrain({ bounds, cellSize: 1 });
    terrain.apply({ mode: "raise", center: [0, 0], radius: 4, strength: 5 });
    terrain.reset();
    expect(terrain.sampleHeight(0, 0)).toBe(0);
    expect(terrain.surfaceAt(0, 0)).toBeNull();
  });
});

describe("terraform brush", () => {
  test("brush verbs drive the underlying field and radius is adjustable", () => {
    const terrain = createEditableTerrain({ bounds, cellSize: 1 });
    const brush = createTerraformBrush(terrain, { radius: 3, strength: 1 });
    brush.raise([0, 0]);
    expect(terrain.sampleHeight(0, 0)).toBeGreaterThan(0);
    brush.setRadius(6);
    expect(brush.config().radius).toBe(6);
    brush.paint([5, 5], "gravel");
    expect(terrain.surfaceAt(5, 5)).toBe("gravel");
  });
});

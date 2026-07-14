import { describe, expect, test } from "bun:test";

import {
  applyDeltaToSnapshot,
  applySurfaceDeltaToSnapshot,
  beginSurfaceStroke,
  beginTerraformStroke,
  brushWeight,
  createEditableTerrain,
  createTerraformBrush,
  createTerrainSnapshot,
  editableTerrainFromSnapshot,
  revertDeltaFromSnapshot,
  revertSurfaceDeltaFromSnapshot,
} from "./terraform";
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

describe("sculpt brushes", () => {
  test("smooth pulls a spike toward its neighborhood average", () => {
    const terrain = createEditableTerrain({ bounds, base: flatField(), cellSize: 1 });
    terrain.apply({ mode: "raise", center: [0, 0], radius: 1.2, strength: 8, falloff: "none" });
    const spike = terrain.sampleHeight(0, 0);
    for (let i = 0; i < 6; i += 1) terrain.apply({ mode: "smooth", center: [0, 0], radius: 4, strength: 1 });
    expect(terrain.sampleHeight(0, 0)).toBeLessThan(spike);
  });

  test("noise is deterministic per seed and roughens a flat field", () => {
    const a = createEditableTerrain({ bounds, cellSize: 1 });
    const b = createEditableTerrain({ bounds, cellSize: 1 });
    a.apply({ mode: "noise", center: [0, 0], radius: 8, strength: 3, seed: 42, falloff: "none" });
    b.apply({ mode: "noise", center: [0, 0], radius: 8, strength: 3, seed: 42, falloff: "none" });
    expect(a.sampleHeight(3, 3)).toBeCloseTo(b.sampleHeight(3, 3));
    const c = createEditableTerrain({ bounds, cellSize: 1 });
    c.apply({ mode: "noise", center: [0, 0], radius: 8, strength: 3, seed: 7, falloff: "none" });
    expect(c.sampleHeight(3, 3)).not.toBeCloseTo(a.sampleHeight(3, 3));
  });

  test("ramp grades a straight slope between two endpoint heights", () => {
    const terrain = createEditableTerrain({ bounds, cellSize: 1 });
    for (let i = 0; i < 6; i += 1)
      terrain.apply({ mode: "ramp", center: [-10, 0], to: [10, 0], radius: 3, strength: 1, target: 0, targetTo: 10 });
    expect(terrain.sampleHeight(-10, 0)).toBeCloseTo(0, 0);
    expect(terrain.sampleHeight(10, 0)).toBeCloseTo(10, 0);
    expect(terrain.sampleHeight(0, 0)).toBeGreaterThan(3);
    expect(terrain.sampleHeight(0, 0)).toBeLessThan(7);
  });

  test("height limit clamps the resulting terrain height", () => {
    const terrain = createEditableTerrain({ bounds, base: flatField(), cellSize: 1 });
    terrain.apply({ mode: "raise", center: [0, 0], radius: 4, strength: 20, heightLimit: { max: 5 } });
    expect(terrain.sampleHeight(0, 0)).toBeLessThanOrEqual(5 + 1e-6);
  });

  test("square shape edits a wider footprint than a circle at the corners", () => {
    const circle = createEditableTerrain({ bounds, cellSize: 1 });
    const square = createEditableTerrain({ bounds, cellSize: 1 });
    circle.apply({ mode: "raise", center: [0, 0], radius: 5, strength: 4, falloff: "none", shape: "circle" });
    square.apply({ mode: "raise", center: [0, 0], radius: 5, strength: 4, falloff: "none", shape: "square" });
    expect(circle.sampleHeight(4.5, 4.5)).toBe(0);
    expect(square.sampleHeight(4.5, 4.5)).toBeGreaterThan(0);
  });
});

describe("terraform deltas and strokes", () => {
  test("editDelta round-trips: applyDelta redoes, revertDelta undoes", () => {
    const terrain = createEditableTerrain({ bounds, cellSize: 1 });
    const before = terrain.sampleHeight(0, 0);
    const delta = terrain.editDelta({ mode: "raise", center: [0, 0], radius: 4, strength: 3 });
    expect(delta.indices.length).toBeGreaterThan(0);
    expect(delta.indices.length).toBe(delta.before.length);
    expect(delta.indices.length).toBe(delta.after.length);
    const after = terrain.sampleHeight(0, 0);
    expect(after).toBeGreaterThan(before);
    terrain.revertDelta(delta);
    expect(terrain.sampleHeight(0, 0)).toBeCloseTo(before);
    terrain.applyDelta(delta);
    expect(terrain.sampleHeight(0, 0)).toBeCloseTo(after);
  });

  test("a stroke of many stamps collapses into one net delta", () => {
    const terrain = createEditableTerrain({ bounds, cellSize: 1 });
    const stroke = beginTerraformStroke(terrain);
    for (let i = 0; i < 5; i += 1) stroke.stamp({ mode: "raise", center: [i - 2, 0], radius: 3, strength: 1 });
    const delta = stroke.delta();
    expect(stroke.isEmpty()).toBe(false);
    // Every touched index is unique and reverting restores the original flat field.
    expect(new Set(delta.indices).size).toBe(delta.indices.length);
    terrain.revertDelta(delta);
    expect(terrain.sampleHeight(0, 0)).toBeCloseTo(0);
    expect(terrain.sampleHeight(-2, 0)).toBeCloseTo(0);
  });

  test("snapshot deltas are copy-on-write and reversible", () => {
    const snapshot = createTerrainSnapshot({ bounds, cellSize: 1 });
    const live = editableTerrainFromSnapshot(snapshot, flatField());
    const delta = live.editDelta({ mode: "raise", center: [0, 0], radius: 4, strength: 3 });
    const raised = applyDeltaToSnapshot(snapshot, delta);
    expect(snapshot.offsets).not.toBe(raised.offsets);
    expect(Math.max(...raised.offsets)).toBeGreaterThan(0);
    expect(Math.max(...snapshot.offsets)).toBe(0);
    const reverted = revertDeltaFromSnapshot(raised, delta);
    expect(Math.max(...reverted.offsets.map((v) => Math.abs(v)))).toBeCloseTo(0);
  });
});

describe("surface painting", () => {
  const bounds = { minX: -16, minZ: -16, maxX: 16, maxZ: 16 };

  test("paintDelta records changed cells and round-trips via apply/revert", () => {
    const terrain = createEditableTerrain({ bounds, cellSize: 1 });
    const delta = terrain.paintDelta({ mode: "paint", center: [0, 0], radius: 3, surface: "rock" });
    expect(delta.indices.length).toBeGreaterThan(0);
    expect(terrain.surfaceAt(0, 0)).toBe("rock");
    terrain.revertSurfaceDelta(delta);
    expect(terrain.surfaceAt(0, 0)).toBeNull();
    terrain.applySurfaceDelta(delta);
    expect(terrain.surfaceAt(0, 0)).toBe("rock");
  });

  test("a paint stroke of many stamps collapses into one net delta", () => {
    const terrain = createEditableTerrain({ bounds, cellSize: 1 });
    const stroke = beginSurfaceStroke(terrain);
    for (let i = 0; i < 4; i += 1) stroke.stamp({ mode: "paint", center: [i - 1, 0], radius: 2, surface: "sand" });
    const delta = stroke.delta();
    expect(stroke.isEmpty()).toBe(false);
    expect(new Set(delta.indices).size).toBe(delta.indices.length);
    terrain.revertSurfaceDelta(delta);
    expect(terrain.surfaceAt(0, 0)).toBeNull();
  });

  test("fillSurfaceDelta paints every cell and clears with null", () => {
    const terrain = createEditableTerrain({ bounds, cellSize: 2 });
    terrain.fillSurfaceDelta("grass");
    expect(terrain.surfaceAt(0, 0)).toBe("grass");
    expect(terrain.surfaceAt(10, -10)).toBe("grass");
    const clear = terrain.fillSurfaceDelta(null);
    expect(clear.indices.length).toBeGreaterThan(0);
    expect(terrain.surfaceAt(0, 0)).toBeNull();
  });

  test("autoPaintDelta assigns a surface by height threshold", () => {
    const terrain = createEditableTerrain({ bounds, base: flatField(), cellSize: 1 });
    terrain.apply({ mode: "raise", center: [0, 0], radius: 6, strength: 10, falloff: "none" });
    terrain.autoPaintDelta({ surface: "snow", minHeight: 3 });
    expect(terrain.surfaceAt(0, 0)).toBe("snow");
    expect(terrain.surfaceAt(15, 15)).toBeNull();
  });

  test("surface snapshot deltas are copy-on-write", () => {
    const snapshot = createTerrainSnapshot({ bounds, cellSize: 2 });
    const live = editableTerrainFromSnapshot(snapshot);
    const delta = live.paintDelta({ mode: "paint", center: [0, 0], radius: 4, surface: "dirt" });
    const painted = applySurfaceDeltaToSnapshot(snapshot, delta);
    expect(snapshot.surfaces).not.toBe(painted.surfaces);
    expect(painted.surfaces.some((s) => s === "dirt")).toBe(true);
    expect(snapshot.surfaces.every((s) => s === null)).toBe(true);
    const reverted = revertSurfaceDeltaFromSnapshot(painted, delta);
    expect(reverted.surfaces.every((s) => s === null)).toBe(true);
  });
});

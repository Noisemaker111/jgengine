import { describe, expect, test } from "bun:test";

import {
  applyWeightDeltaToSnapshot,
  beginBlendStroke,
  createEditableTerrain,
  createTerrainSnapshot,
  dirtyBoundsFromIndices,
  editableTerrainFromSnapshot,
  migrateTerrainSnapshot,
  revertWeightDeltaFromSnapshot,
  type TerrainMaterialLayer,
} from "./terraform";
import { environment, terrain as terrainDescriptor } from "./features";
import { groundFieldFor, resolveEnvironmentField } from "./terrain";

const bounds = { minX: -16, minZ: -16, maxX: 16, maxZ: 16 };

function paintedSnapshot() {
  const terrain = createEditableTerrain({ bounds, cellSize: 2 });
  terrain.applySurfaceDelta(terrain.fillSurfaceDelta("grass"));
  terrain.applySurfaceDelta(terrain.paintDelta({ mode: "paint", center: [0, 0], radius: 6, surface: "dirt" }));
  return terrain.snapshot();
}

describe("migrateTerrainSnapshot", () => {
  test("derives a layer stack from distinct painted surfaces, first-seen order", () => {
    const migrated = migrateTerrainSnapshot(paintedSnapshot());
    expect(migrated.layers?.map((layer) => layer.surface)).toEqual(["grass", "dirt"]);
    // Lazy: no weight buffer until a blend is painted.
    expect(migrated.weights).toBeUndefined();
  });

  test("is idempotent — an already-migrated snapshot is returned unchanged", () => {
    const once = migrateTerrainSnapshot(paintedSnapshot());
    const twice = migrateTerrainSnapshot(once);
    expect(twice.layers).toBe(once.layers);
  });

  test("a fresh terrain migrates to an empty layer stack", () => {
    const migrated = migrateTerrainSnapshot(createTerrainSnapshot({ bounds, cellSize: 2 }));
    expect(migrated.layers).toEqual([]);
  });
});

describe("weighted blend", () => {
  const layers: TerrainMaterialLayer[] = [
    { id: "grass", surface: "grass" },
    { id: "dirt", surface: "dirt" },
  ];

  test("blend paint mixes two layers in a cell and the weights sum to ~1", () => {
    const terrain = createEditableTerrain({ bounds, cellSize: 2 });
    terrain.applySurfaceDelta(terrain.fillSurfaceDelta("grass"));
    terrain.setLayers(layers);
    // Push toward dirt at the origin.
    for (let i = 0; i < 8; i += 1) {
      terrain.blendRecording({ mode: "paint", center: [0, 0], radius: 6, surface: "dirt", strength: 1 }, () => {});
    }
    const w = terrain.weightsAt(0, 0);
    expect(w.length).toBe(2);
    expect(w[0]! + w[1]!).toBeCloseTo(1, 3);
    expect(w[1]).toBeGreaterThan(0.9);
    // Dominant surface now reads back as dirt.
    expect(terrain.surfaceAt(0, 0)).toBe("dirt");
  });

  test("blend delta round-trips through a snapshot (redo/undo)", () => {
    const seed = createEditableTerrain({ bounds, cellSize: 2 });
    seed.applySurfaceDelta(seed.fillSurfaceDelta("grass"));
    seed.setLayers(layers);
    const base = seed.snapshot();

    const live = editableTerrainFromSnapshot(base);
    const stroke = beginBlendStroke(live);
    stroke.stamp({ mode: "paint", center: [0, 0], radius: 6, surface: "dirt", strength: 1 });
    const delta = stroke.delta();
    expect(delta.indices.length).toBeGreaterThan(0);
    expect(delta.layerCount).toBe(2);

    const applied = applyWeightDeltaToSnapshot(base, delta);
    expect(applied.weights).toBeDefined();
    const reverted = revertWeightDeltaFromSnapshot(applied, delta);
    // Undo restores the seeded (all-grass) weights.
    const reader = editableTerrainFromSnapshot(reverted);
    expect(reader.surfaceAt(0, 0)).toBe("grass");
  });

  test("setLayers with a changed id sequence drops stale weights", () => {
    const terrain = createEditableTerrain({ bounds, cellSize: 2 });
    terrain.setLayers(layers);
    terrain.blendRecording({ mode: "paint", center: [0, 0], radius: 6, surface: "dirt", strength: 1 }, () => {});
    expect(terrain.snapshot().weights).toBeDefined();
    terrain.setLayers([{ id: "rock", surface: "rock" }]);
    expect(terrain.snapshot().weights).toBeUndefined();
  });
});

describe("dirtyBoundsFromIndices", () => {
  test("spans the touched vertices, expanded by the margin", () => {
    const snapshot = createTerrainSnapshot({ bounds, cellSize: 2 });
    const live = editableTerrainFromSnapshot(snapshot);
    const delta = live.editDelta({ mode: "raise", center: [0, 0], radius: 4, strength: 1 });
    const region = dirtyBoundsFromIndices(snapshot, delta.indices, 1);
    expect(region).not.toBeNull();
    // Region brackets the brush center and is strictly positive-area.
    expect(region!.minX).toBeLessThanOrEqual(0);
    expect(region!.maxX).toBeGreaterThanOrEqual(0);
    expect(region!.minX).toBeLessThan(region!.maxX);
    expect(region!.minZ).toBeLessThan(region!.maxZ);
  });

  test("returns null for an empty index list", () => {
    const snapshot = createTerrainSnapshot({ bounds, cellSize: 2 });
    expect(dirtyBoundsFromIndices(snapshot, [], 0)).toBeNull();
  });
});

describe("sculpt runtime seam", () => {
  test("environment({ sculpt }) layers authored offsets into the ground field (render + collision)", () => {
    const editable = createEditableTerrain({ bounds, cellSize: 2 });
    editable.apply({ mode: "raise", center: [0, 0], radius: 8, strength: 4, falloff: "none" });
    const snapshot = editable.snapshot();

    const flat = environment({ terrain: terrainDescriptor({ bounds: { w: 32, d: 32 }, height: 0 }) });
    const sculpted = environment({
      terrain: terrainDescriptor({ bounds: { w: 32, d: 32 }, height: 0 }),
      sculpt: snapshot,
    });

    const baseHeight = groundFieldFor(flat).sampleHeight(0, 0);
    const raised = resolveEnvironmentField(sculpted).sampleHeight(0, 0);
    // The authored mound lifts the ground at its center by roughly the stamp strength.
    expect(raised - baseHeight).toBeGreaterThan(3);
    // Far outside the mound the offset is ~0.
    expect(Math.abs(resolveEnvironmentField(sculpted).sampleHeight(15, 15) - baseHeight)).toBeLessThan(0.5);
  });
});

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
import { flattenFieldAround, groundFieldFor, resolveEnvironmentField } from "./terrain";

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

describe("clearance flatten seam", () => {
  test("flattenFieldAround levels a mound toward the zone center height", () => {
    const editable = createEditableTerrain({ bounds, cellSize: 2 });
    editable.apply({ mode: "raise", center: [0, 0], radius: 10, strength: 6, falloff: "smooth" });
    const mound = editableTerrainFromSnapshot(editable.snapshot());
    const peak = mound.sampleHeight(0, 0);
    expect(peak).toBeGreaterThan(3);
    // A clearance disc at the peak flattens it back toward the (raised) center height, but the ramp
    // means a point partway out is pulled down from the un-flattened mound height there.
    const flattened = flattenFieldAround(mound, [{ x: 0, z: 0, radius: 8, feather: 3 }]);
    // At the very center the target IS the peak, so it stays; just inside the rim it is leveled up/flat.
    expect(flattened.sampleHeight(6, 0)).toBeGreaterThan(mound.sampleHeight(6, 0) - 0.01);
    expect(Math.abs(flattened.sampleHeight(1, 0) - peak)).toBeLessThan(0.5);
    // Outside the zone the mound is untouched.
    expect(flattened.sampleHeight(15, 0)).toBeCloseTo(mound.sampleHeight(15, 0), 5);
  });

  test("environment({ clearings }) flattens the ground under a spawn even with a nearby sculpt mound", () => {
    const editable = createEditableTerrain({ bounds, cellSize: 2 });
    editable.apply({ mode: "raise", center: [6, 0], radius: 10, strength: 6, falloff: "smooth" });
    const snapshot = editable.snapshot();
    const withMound = resolveEnvironmentField(
      environment({ terrain: terrainDescriptor({ bounds: { w: 32, d: 32 }, height: 0 }), sculpt: snapshot }),
    );
    const cleared = resolveEnvironmentField(
      environment({
        terrain: terrainDescriptor({ bounds: { w: 32, d: 32 }, height: 0 }),
        sculpt: snapshot,
        clearings: [{ x: 0, z: 0, radius: 5, feather: 2 }],
      }),
    );
    // The clearing cuts a level shelf at the spawn: flat across its core...
    expect(Math.abs(cleared.sampleHeight(0, 0) - cleared.sampleHeight(3, 0))).toBeLessThan(0.4);
    // ...and off-center (toward the mound) it is leveled down from the un-cleared sloped ground.
    expect(withMound.sampleHeight(3, 0)).toBeGreaterThan(cleared.sampleHeight(3, 0) + 0.2);
  });
});

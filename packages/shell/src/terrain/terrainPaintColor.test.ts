import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { createEmptyEditorDocument } from "@jgengine/core/editor/document";
import { environmentContentFromDocument } from "@jgengine/core/editor/environment";
import { environment, terrain } from "@jgengine/core/world/features";
import { resolveEnvironmentField } from "@jgengine/core/world/terrain";
import { createEditableTerrain, editableTerrainFromSnapshot } from "@jgengine/core/world/terraform";
import { terrainGroundColorSampler } from "../environment/terrainGroundColor";
import { createFieldGroundGeometry } from "./terrainMath";
import { createTerrainPaintColorSampler } from "./terrainPaintColor";

function authored() {
  return createEditableTerrain({ bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 }, cellSize: 1 });
}

describe("authored terrain paint in shared ground", () => {
  test("old single-surface documents retain their editor palette, unknown and outside cells retain the caller's color", () => {
    const editable = authored();
    editable.fillSurfaceDelta("grass");
    const sample = createTerrainPaintColorSampler(editableTerrainFromSnapshot(editable.snapshot()));
    const color = new THREE.Color("#ff00ff");
    expect(sample(0, 0, color)).toBe(true);
    expect(color.getHexString()).toBe("4b7f3f");
    expect(sample(3, 0, color)).toBe(false);
    expect(color.getHexString()).toBe("4b7f3f");
    editable.fillSurfaceDelta("custom-unknown");
    expect(createTerrainPaintColorSampler(editable)(0, 0, color)).toBe(false);
    expect(color.getHexString()).toBe("4b7f3f");
  });

  test("authored tint replaces the palette and weighted opacity blends in linear color space after serialization", () => {
    const editable = authored();
    editable.setLayers([
      { id: "home", surface: "rock", tint: "#ff0000", opacity: 0.5, tiling: 2 },
      { id: "garden", surface: "grass", tint: "#0000ff", opacity: 1 },
    ]);
    editable.fillSurfaceDelta("rock");
    editable.blendPaintDelta({ mode: "paint", surface: "grass", center: [0, 0], radius: 4, strength: 0.5, falloff: "none" });
    const restored = editableTerrainFromSnapshot(JSON.parse(JSON.stringify(editable.snapshot())));
    const color = new THREE.Color();
    expect(createTerrainPaintColorSampler(restored)(0, 0, color)).toBe(true);
    expect(color.r).toBeCloseTo(1 / 3);
    expect(color.g).toBe(0);
    expect(color.b).toBeCloseTo(2 / 3);
    expect(restored.layers[0]!.tiling).toBe(2);
  });

  test("zero opacity and unpainted weights preserve descriptor color", () => {
    const editable = authored();
    editable.setLayers([{ id: "hidden", surface: "rock", tint: "#ff0000", opacity: 0 }]);
    editable.fillSurfaceDelta("rock");
    const color = new THREE.Color("#112233");
    expect(createTerrainPaintColorSampler(editable)(0, 0, color)).toBe(false);
    expect(color.getHexString()).toBe("112233");
    editable.fillSurfaceDelta(null);
    editable.blendPaintDelta({ mode: "paint", surface: "rock", center: [1, 1], radius: 0.2, strength: 0.5 });
    expect(createTerrainPaintColorSampler(editable)(-1, -1, color)).toBe(false);
    expect(color.getHexString()).toBe("112233");
  });

  test("a document reaches the normal ground vertex colors and grass roots without changing heights or unpainted vertices", () => {
    const editable = authored();
    editable.setLayers([{ id: "home", surface: "rock", tint: "#d6ddd0" }]);
    editable.apply({ mode: "raise", center: [0, 0], radius: 1, strength: 0.8 });
    editable.paintDelta({ mode: "paint", surface: "rock", center: [0, 0], radius: 1 });
    const doc = { ...createEmptyEditorDocument(), terrain: JSON.parse(JSON.stringify(editable.snapshot())) };
    const content = environmentContentFromDocument(doc);
    const world = environment({ terrain: terrain({ bounds: { w: 8, d: 8 }, height: 0 }), sculpt: content.sculpt });
    const field = resolveEnvironmentField(world);
    const options = { size: [8, 8] as const, segments: 8 };
    const original = createFieldGroundGeometry(field, options);
    const painted = createFieldGroundGeometry(field, { ...options,
      paintColorAt: createTerrainPaintColorSampler(editableTerrainFromSnapshot(content.sculpt!)),
    });
    expect(Array.from(painted.attributes.position.array)).toEqual(Array.from(original.attributes.position.array));
    const expected = new THREE.Color("#d6ddd0");
    const center = 4 * 9 + 4;
    expect(painted.attributes.color.getX(center)).toBeCloseTo(expected.r);
    expect(painted.attributes.color.getY(center)).toBeCloseTo(expected.g);
    expect(painted.attributes.color.getZ(center)).toBeCloseTo(expected.b);
    expect(painted.attributes.color.getX(0)).toBe(original.attributes.color.getX(0));
    const roots = terrainGroundColorSampler(world.terrain, field, content.sculpt)!;
    expect(roots(0, 0)).toBe("#d6ddd0");
    expect(terrainGroundColorSampler(undefined, field, content.sculpt)!(0, 0)).toBe("#d6ddd0");
    original.dispose(); painted.dispose();
  });
});

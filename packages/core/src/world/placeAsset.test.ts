import { describe, expect, test } from "bun:test";

import {
  placeAssetFromCommit,
  resolvePlaceAsset,
  toEditorMarker,
  toStructureInput,
} from "./placeAsset";
import { createPlacementController } from "./placementController";
import { createPlacedStructureStore } from "./placedStructureStore";

describe("placeAsset", () => {
  test("resolvePlaceAsset builds a shared payload with asset meta", () => {
    const result = resolvePlaceAsset({
      assetId: "hut_01",
      position: [1, 2, 3],
      knownKind: "building",
      knownLabel: "Hut",
      knownUrl: "/models/hut.glb",
      rotationY: Math.PI / 2,
      id: "fixed-id",
    });
    expect(result).toEqual({
      id: "fixed-id",
      assetId: "hut_01",
      kind: "building",
      label: "Hut",
      position: { x: 1, y: 2, z: 3 },
      rotationY: Math.PI / 2,
      color: "#e2e8f0",
      meta: { assetId: "hut_01", url: "/models/hut.glb" },
    });
  });

  test("placeAssetFromCommit maps a valid controller commit onto the same verb", () => {
    const controller = createPlacementController({
      footprint: { w: 2, d: 2 },
      snapMode: "grid",
      grid: 1,
    });
    controller.hover({ point: [3.2, 1.5, 4.8], normal: [0, 1, 0] });
    const commit = controller.commit();
    expect(commit).not.toBeNull();
    const placed = placeAssetFromCommit(commit!, "crate", { kind: "prop", label: "Crate" });
    expect(placed.assetId).toBe("crate");
    expect(placed.position).toEqual({ x: 3, y: 1.5, z: 5 });
    expect(placed.rotationY).toBe(0);
    expect(placed.kind).toBe("prop");
  });

  test("toStructureInput and toEditorMarker share one resolved placement", () => {
    const result = resolvePlaceAsset({
      assetId: "rock",
      position: { x: 2, y: 0, z: -1 },
      rotationY: 0.5,
      id: "rock-1",
      kind: "prop",
    });
    const structure = toStructureInput(result);
    expect(structure).toEqual({
      id: "rock-1",
      catalogId: "rock",
      position: [2, 0, -1],
      rotationY: 0.5,
      data: { assetId: "rock", kind: "prop", label: "rock", color: "#e2e8f0" },
    });
    const marker = toEditorMarker(result);
    expect(marker.id).toBe("rock-1");
    expect(marker.position).toEqual({ x: 2, y: 0, z: -1 });
    expect(marker.meta.assetId).toBe("rock");

    const store = createPlacedStructureStore();
    const added = store.add(structure);
    expect(added.id).toBe("rock-1");
    expect(store.get("rock-1")?.position).toEqual([2, 0, -1]);
  });

  test("defaults kind to prop and label to assetId", () => {
    const result = resolvePlaceAsset({ assetId: "barrel", position: [0, 0, 0] });
    expect(result.kind).toBe("prop");
    expect(result.label).toBe("barrel");
  });
});

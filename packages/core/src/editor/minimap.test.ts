import { describe, expect, it } from "bun:test";
import { createEmptyEditorDocument } from "./document";
import { bakeMinimapFromDocument, documentBakeZones } from "./minimap";
import type { EditorDocument, EditorMarker, EditorVolume } from "./types";

function marker(id: string, x: number, z: number): EditorMarker {
  return { id, kind: "prop", position: { x, y: 0, z } };
}

function boxVolume(id: string, cx: number, cz: number, color?: string): EditorVolume {
  return {
    id,
    kind: "zone",
    shape: "box",
    center: { x: cx, y: 0, z: cz },
    halfExtents: { x: 20, y: 10, z: 20 },
    ...(color === undefined ? {} : { color }),
  };
}

function docWith(partial: Partial<EditorDocument>): EditorDocument {
  return { ...createEmptyEditorDocument(), ...partial };
}

describe("documentBakeZones", () => {
  it("tints only volumes that carry a color, over their footprint", () => {
    const doc = docWith({ volumes: [boxVolume("a", 0, 0, "#ff0000"), boxVolume("b", 50, 50)] });
    const zones = documentBakeZones(doc);
    expect(zones).toHaveLength(1);
    expect(zones[0]!.color).toBe("#ff0000");
    expect(zones[0]!.polygon).toEqual([
      [-20, -20],
      [20, -20],
      [20, 20],
      [-20, 20],
    ]);
  });
});

describe("bakeMinimapFromDocument", () => {
  const flat = () => 0;

  it("bakes a data URI + bounds sized to the authored objects", () => {
    const doc = docWith({ markers: [marker("far", 60, 40)] });
    const { background, mapBounds } = bakeMinimapFromDocument(doc, flat, { padding: 16, resolution: 24 });
    expect(background.startsWith("data:image/png;base64,")).toBe(true);
    // origin-ish object at (60,40) plus padding 16 → bounds reach it.
    expect(mapBounds.maxX).toBe(76);
    expect(mapBounds.maxZ).toBe(56);
  });

  it("is deterministic for a fixed document + sampler", () => {
    const doc = docWith({ markers: [marker("a", 10, 10)], volumes: [boxVolume("z", 0, 0, "#00ff00")] });
    const height = (x: number, z: number) => Math.sin(x * 0.1) + Math.cos(z * 0.1);
    const a = bakeMinimapFromDocument(doc, height, { resolution: 20 });
    const b = bakeMinimapFromDocument(doc, height, { resolution: 20 });
    expect(a.background).toBe(b.background);
    expect(a.mapBounds).toEqual(b.mapBounds);
  });

  it("honors explicit bounds and a water level", () => {
    const doc = createEmptyEditorDocument();
    const { mapBounds } = bakeMinimapFromDocument(doc, () => -5, {
      bounds: { minX: 0, minZ: 0, maxX: 100, maxZ: 100 },
      waterLevel: 0,
      resolution: 16,
    });
    expect(mapBounds).toEqual({ minX: 0, minZ: 0, maxX: 100, maxZ: 100 });
  });
});

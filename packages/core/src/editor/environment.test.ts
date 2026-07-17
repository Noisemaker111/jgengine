import { describe, expect, it } from "bun:test";
import { createEmptyEditorDocument } from "./document";
import { environmentContentFromDocument, terrainBoundsFromDocument } from "./environment";
import type { EditorDocument, EditorMarker } from "./types";

function marker(id: string, kind: string, x: number, z: number): EditorMarker {
  return { id, kind, position: { x, y: 0, z } };
}

function docWith(markers: EditorMarker[]): EditorDocument {
  return { ...createEmptyEditorDocument(), markers };
}

describe("terrainBoundsFromDocument", () => {
  it("returns minBounds for an empty document", () => {
    expect(terrainBoundsFromDocument(createEmptyEditorDocument())).toEqual({ w: 64, d: 64 });
    expect(terrainBoundsFromDocument(createEmptyEditorDocument(), { minBounds: { w: 160, d: 160 } })).toEqual({
      w: 160,
      d: 160,
    });
  });

  it("sizes the origin-centered footprint to cover the farthest object plus padding", () => {
    const doc = docWith([marker("a", "prop", 40, -10), marker("b", "prop", -5, 30)]);
    // halfX = 40, halfZ = 30, padding 24 -> w = 80 + 48 = 128, d = 60 + 48 = 108
    expect(terrainBoundsFromDocument(doc, { padding: 24 })).toEqual({ w: 128, d: 108 });
  });

  it("floors the derived size to minBounds", () => {
    const doc = docWith([marker("a", "prop", 5, 5)]);
    expect(terrainBoundsFromDocument(doc, { padding: 4, minBounds: { w: 160, d: 160 } })).toEqual({ w: 160, d: 160 });
  });
});

describe("environmentContentFromDocument", () => {
  it("derives clearings from authored spawn/POI kinds", () => {
    const doc = docWith([
      marker("player_spawn", "player_spawn", 0, 0),
      marker("chest_1", "chest", 12, 8),
      marker("tree_1", "prop", 30, 30), // not a clearance kind
    ]);
    const content = environmentContentFromDocument(doc);
    const centers = content.clearings.map((z) => `${z.x},${z.z}`);
    expect(centers).toContain("0,0");
    expect(centers).toContain("12,8");
    expect(centers).not.toContain("30,30");
  });

  it("carries the document sculpt snapshot when present", () => {
    const doc = docWith([marker("player_spawn", "player_spawn", 0, 0)]);
    expect(environmentContentFromDocument(doc).sculpt).toBeUndefined();

    const sculpted: EditorDocument = {
      ...doc,
      terrain: { version: 1, resolution: 2, size: 10, offsets: [] } as unknown as EditorDocument["terrain"],
    };
    expect(environmentContentFromDocument(sculpted).sculpt).toBe(sculpted.terrain);
  });

  it("bounds cover the authored objects so nothing falls off the ground", () => {
    const doc = docWith([marker("far", "prop", 90, 70), marker("spawn", "player_spawn", 0, 0)]);
    const content = environmentContentFromDocument(doc, { padding: 10 });
    // origin-centered terrain of this size spans ±w/2, ±d/2 — must reach the farthest object.
    expect(content.bounds.w / 2).toBeGreaterThanOrEqual(90);
    expect(content.bounds.d / 2).toBeGreaterThanOrEqual(70);
  });
});

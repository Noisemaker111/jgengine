import { describe, expect, test } from "bun:test";

import { buildBorderlands2EditorLayers } from "./editorLayers";

describe("borderlands2 editorLayers", () => {
  test("exposes zones, spawns, bosses, and activation ranges", () => {
    const doc = buildBorderlands2EditorLayers();
    expect(doc.markers.some((m) => m.id === "player_spawn")).toBe(true);
    expect(doc.markers.some((m) => m.id === "boss_warrior")).toBe(true);
    expect(doc.markers.some((m) => m.id === "boss_flynt")).toBe(true);
    expect(doc.volumes.some((v) => v.id === "zone_windshear_waste")).toBe(true);
    expect(doc.volumes.some((v) => v.kind === "aggro")).toBe(true);
    expect(doc.volumes.some((v) => v.kind === "leash")).toBe(true);
    expect(doc.volumes.some((v) => v.kind === "discover")).toBe(true);
    expect(doc.paths.length).toBeGreaterThan(0);
  });
});

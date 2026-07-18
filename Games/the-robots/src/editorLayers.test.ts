import { describe, expect, test } from "bun:test";

import { buildTheRobotsEditorLayers } from "./editorLayers";

describe("the-robots editorLayers", () => {
  test("loads scene-owned sites and projects derived AI ranges", () => {
    const doc = buildTheRobotsEditorLayers();
    expect(doc.markers.some((m) => m.id === "player_spawn")).toBe(true);
    expect(doc.markers.some((m) => m.id === "bolt")).toBe(true);
    expect(doc.markers.some((m) => m.id === "boss_warrior")).toBe(true);
    expect(doc.markers.some((m) => m.id === "boss_rusk")).toBe(true);
    expect(doc.markers.some((m) => m.id === "vendor_rigg")).toBe(true);
    expect(doc.markers.some((m) => m.id === "travel_arid_badlands")).toBe(true);
    expect(doc.volumes.some((v) => v.id === "zone_windshear_waste")).toBe(true);
    expect(doc.volumes.some((v) => v.kind === "aggro")).toBe(true);
    expect(doc.volumes.some((v) => v.kind === "leash")).toBe(true);
    expect(doc.volumes.some((v) => v.kind === "discover")).toBe(true);
    expect(doc.paths.length).toBeGreaterThan(0);
  });
});

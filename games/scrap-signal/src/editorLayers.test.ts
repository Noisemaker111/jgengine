import { describe, expect, test } from "bun:test";
import { decodeEditorDocument } from "@jgengine/core/editor/index";

import sceneJson from "./editor.scene.json";
import { buildScrapSignalEditorLayers } from "./editorLayers";

describe("scrap-signal editorLayers", () => {
  test("loads scene-owned sites and projects derived AI ranges", () => {
    const doc = buildScrapSignalEditorLayers();
    const decoded = decodeEditorDocument(doc);
    expect(decoded.ok).toBe(true);
    expect(doc.markers.some((m) => m.id === "player_spawn")).toBe(true);
    expect(doc.markers.some((m) => m.id === "bolt")).toBe(true);
    expect(doc.markers.some((m) => m.id === "boss_foundry_heart")).toBe(true);
    expect(doc.markers.some((m) => m.id === "boss_rusk")).toBe(true);
    expect(doc.markers.some((m) => m.id === "vendor_rigg")).toBe(true);
    expect(doc.markers.some((m) => m.id === "travel_arid_badlands")).toBe(true);
    expect(doc.volumes.some((v) => v.id === "zone_rustflat_waste")).toBe(true);
    expect(doc.volumes.some((v) => v.kind === "aggro")).toBe(true);
    expect(doc.volumes.some((v) => v.kind === "leash")).toBe(true);
    expect(doc.volumes.some((v) => v.kind === "discover")).toBe(true);
    expect(doc.paths.length).toBeGreaterThan(0);
  });

  test("the scene file holds no derived AI volumes", () => {
    const derived = new Set(buildScrapSignalEditorLayers().volumes.filter((v) => v.meta?.["derived"] === true).map((v) => v.id));
    expect(derived.size).toBeGreaterThan(80);
    expect(sceneJson.volumes.filter((v) => derived.has(v.id))).toEqual([]);
  });
});

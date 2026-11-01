import { describe, expect, test } from "bun:test";

import { normalizeEditorLayers } from "../editor/document";
import { landformStartTerrain, withGeneratedTerrain } from "./landformStart";

const doc = () => normalizeEditorLayers({ version: 1, markers: [], volumes: [], paths: [], annotations: [], prefabs: [], collections: [], catalogs: [], terrainGenerator: { kind: "landform", start: "dunes", seed: "sand-sea" } });

describe("landform start", () => {
  test("a document with a generator and no sculpt grows its terrain on load, the same every time", () => {
    const loaded = withGeneratedTerrain(doc());
    expect(loaded.terrainGenerator).toEqual({ kind: "landform", start: "dunes", seed: "sand-sea" });
    const terrain = loaded.terrain;
    expect(terrain?.cols).toBeGreaterThan(32);
    expect(terrain?.bounds.maxX ?? 0).toBeGreaterThan(400);
    const offsets = terrain?.offsets ?? [];
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(2);
    expect(offsets.every(Number.isFinite)).toBe(true);
    expect(withGeneratedTerrain(doc()).terrain).toEqual(terrain);
  }, 30_000);

  test("an authored sculpt wins, and a document without a generator is unchanged", () => {
    const sculpted = { ...doc(), terrain: landformStartTerrain("dunes", "other") };
    expect(withGeneratedTerrain(sculpted)).toBe(sculpted);
    const plain = normalizeEditorLayers({ version: 1, markers: [], volumes: [], paths: [], annotations: [], prefabs: [], collections: [], catalogs: [] });
    expect(withGeneratedTerrain(plain)).toBe(plain);
  }, 30_000);

  test("normalizing drops a malformed generator", () => {
    expect(normalizeEditorLayers(JSON.parse('{"version":1,"markers":[],"volumes":[],"paths":[],"annotations":[],"prefabs":[],"collections":[],"catalogs":[],"terrainGenerator":{"kind":"landform","start":"volcano","seed":"x"}}')).terrainGenerator).toBeUndefined();
  });
});

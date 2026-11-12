import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

import { normalizeEditorLayers } from "../../editor/document";
import { findSchemaPreset } from "../../generator/paramSchema";
import { LANDFORM_SCHEMA } from "./landformGenerator";
import { withGeneratedTerrain } from "./landformStart";

const BASE = { version: 1, markers: [], volumes: [], paths: [], annotations: [], prefabs: [], collections: [], catalogs: [] } as const;
const doc = (params: Record<string, unknown> = { start: "dunes", seed: "sand-sea" }) => normalizeEditorLayers({ ...BASE, terrainGenerator: { generator: "landform", params } });
const fingerprint = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

describe("landform start", () => {
  test("a document with a generator and no sculpt grows its terrain on load, the same every time", () => {
    const loaded = withGeneratedTerrain(doc());
    expect(loaded.terrainGenerator).toEqual({ generator: "landform", params: { start: "dunes", seed: "sand-sea" } });
    const terrain = loaded.terrain;
    expect(terrain?.cols).toBeGreaterThan(32);
    expect(terrain?.bounds.maxX ?? 0).toBeGreaterThan(400);
    const offsets = terrain?.offsets ?? [];
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(2);
    expect(offsets.every(Number.isFinite)).toBe(true);
    expect(JSON.stringify(withGeneratedTerrain(doc()).terrain)).toBe(JSON.stringify(terrain));
    expect(JSON.stringify(withGeneratedTerrain(doc({ start: "dunes", seed: "dune-two" })).terrain)).not.toBe(JSON.stringify(terrain));
  }, 30_000);

  test("the named starts are the landform schema's presets, and grow what the old start table grew", () => {
    expect(LANDFORM_SCHEMA.presetKey).toBe("start");
    expect(["glacial-valley", "dunes", "coast"].map((id) => findSchemaPreset(LANDFORM_SCHEMA, id)?.id)).toEqual(["glacial-valley", "dunes", "coast"]);
    // Recorded from landformStartTerrain("dunes", "fp") before the starts moved onto the generator (origin/beta ce992579b).
    expect(fingerprint(withGeneratedTerrain(doc({ start: "dunes", seed: "fp" })).terrain)).toBe("69d70343667c24f1");
  }, 30_000);

  test("params beside the start override its preset", () => {
    const calm = withGeneratedTerrain(doc({ start: "dunes", seed: "fp", side: 48 })).terrain;
    expect(calm?.cols).toBe(47);
  }, 30_000);

  test("an authored sculpt wins, and a document without a generator is unchanged", () => {
    const sculpted = { ...doc(), terrain: withGeneratedTerrain(doc({ start: "dunes", seed: "other" })).terrain };
    expect(withGeneratedTerrain(sculpted)).toBe(sculpted);
    const plain = normalizeEditorLayers({ ...BASE });
    expect(withGeneratedTerrain(plain)).toBe(plain);
  }, 30_000);

  test("normalizing drops a malformed generator", () => {
    expect(normalizeEditorLayers(JSON.parse('{"version":1,"markers":[],"volumes":[],"paths":[],"annotations":[],"prefabs":[],"collections":[],"catalogs":[],"terrainGenerator":{"kind":"landform","start":"dunes","seed":"x"}}')).terrainGenerator).toBeUndefined();
    expect(normalizeEditorLayers(JSON.parse('{"version":1,"markers":[],"volumes":[],"paths":[],"annotations":[],"prefabs":[],"collections":[],"catalogs":[],"terrainGenerator":{"generator":"volcano","params":{}}}')).terrainGenerator).toBeUndefined();
  });
});

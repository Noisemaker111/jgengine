import { describe, expect, it } from "bun:test";

import { cloneEditorDocument, createEmptyEditorDocument, decodeEditorDocument, exportEditorDocumentJson } from "./document";
import { environmentContentFromDocument, skyFromDocument } from "./environment";
import { VOLUMETRIC_CLOUDS_DEFAULTS, VOLUMETRIC_CLOUDS_SCHEMA } from "../sky/volumetricClouds";

describe("volumetric clouds in the scene document", () => {
  it("the schema names every cloud config key with the engine defaults", () => {
    const keys = VOLUMETRIC_CLOUDS_SCHEMA.fields.map((field) => field.key);
    expect(keys).toEqual(["coverage", "density", "height", "thickness", "speed", "scale", "fade", "color", "sunColor", "sunScatter", "seed"]);
    const coverage = VOLUMETRIC_CLOUDS_SCHEMA.fields.find((field) => field.key === "coverage");
    expect(coverage?.type === "range" ? coverage.default : undefined).toBe(VOLUMETRIC_CLOUDS_DEFAULTS.coverage);
  });

  it("round-trips through export and decode, and copies never share it", () => {
    const clouds = { coverage: 0.4, density: 1.4, height: 420, thickness: 260, fade: 4200, seed: "the-island" };
    const doc = { ...createEmptyEditorDocument(), environment: { volumetricClouds: clouds } };
    const decoded = decodeEditorDocument(JSON.parse(exportEditorDocumentJson(doc)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.document.environment?.volumetricClouds).toEqual(clouds);
    const copy = cloneEditorDocument(decoded.document);
    copy.environment!.volumetricClouds!.coverage = 0.9;
    expect(decoded.document.environment?.volumetricClouds?.coverage).toBe(0.4);
  });

  it("an empty bag is a valid 'on at engine defaults' layer", () => {
    const decoded = decodeEditorDocument({ ...createEmptyEditorDocument(), environment: { volumetricClouds: {} } });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(skyFromDocument(decoded.document)?.volumetricClouds).toEqual({});
  });

  it("rejects an unknown key, an out-of-range coverage and a non-colour, naming each path", () => {
    const bad = decodeEditorDocument({
      ...createEmptyEditorDocument(),
      environment: { volumetricClouds: { coverage: 1.5, color: "grey", wisps: 3 } },
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    const paths = bad.errors.map((diagnostic) => diagnostic.path);
    expect(paths).toContain("$.environment.volumetricClouds.coverage");
    expect(paths).toContain("$.environment.volumetricClouds.color");
    expect(paths).toContain("$.environment.volumetricClouds.wisps");
    expect(decodeEditorDocument({ ...createEmptyEditorDocument(), environment: { volumetricClouds: true } }).ok).toBe(false);
  });

  it("projects onto the runtime sky, and a document without clouds leaves the sky without them", () => {
    const doc = { ...createEmptyEditorDocument(), environment: { preset: "day" as const, volumetricClouds: { coverage: 0.6 } } };
    expect(skyFromDocument(doc)?.volumetricClouds).toEqual({ coverage: 0.6 });
    expect(environmentContentFromDocument(doc).sky?.volumetricClouds).toEqual({ coverage: 0.6 });
    const plain = { ...createEmptyEditorDocument(), environment: { preset: "day" as const } };
    expect(skyFromDocument(plain)).not.toHaveProperty("volumetricClouds");
  });
});

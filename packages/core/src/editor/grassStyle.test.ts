import { describe, expect, it } from "bun:test";

import { cloneEditorDocument, createEmptyEditorDocument, decodeEditorDocument, exportEditorDocumentJson } from "./document";
import { environmentContentFromDocument } from "./environment";

describe("world grass style in the scene document", () => {
  it("round-trips through export and decode, and copies never share it", () => {
    const doc = { ...createEmptyEditorDocument(), environment: { grassStyle: { preset: "cartoon", normalLift: 0.7 } } };
    const decoded = decodeEditorDocument(JSON.parse(exportEditorDocumentJson(doc)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.document.environment?.grassStyle).toEqual({ preset: "cartoon", normalLift: 0.7 });
    const copy = cloneEditorDocument(decoded.document);
    copy.environment!.grassStyle!.normalLift = 0.1;
    expect(decoded.document.environment?.grassStyle?.normalLift).toBe(0.7);
  });

  it("rejects an unknown setting, an out-of-range slider and an unknown preset, naming each path", () => {
    const bad = decodeEditorDocument({ ...createEmptyEditorDocument(), environment: { grassStyle: { realism: 3, preset: "anime", glow: 1 } } });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    const paths = bad.errors.map((diagnostic) => diagnostic.path);
    expect(paths).toContain("$.environment.grassStyle.realism");
    expect(paths).toContain("$.environment.grassStyle.preset");
    expect(paths).toContain("$.environment.grassStyle.glow");
  });

  it("reaches code-side grass bands through environmentContentFromDocument", () => {
    const doc = { ...createEmptyEditorDocument(), environment: { grassStyle: { realism: 0.2 } } };
    expect(environmentContentFromDocument(doc).grassStyle).toEqual({ realism: 0.2 });
    expect(environmentContentFromDocument(createEmptyEditorDocument()).grassStyle).toBeUndefined();
  });
});

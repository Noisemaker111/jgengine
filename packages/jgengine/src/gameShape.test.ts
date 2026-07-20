import { describe, expect, test } from "bun:test";

import { isAllowedGameSrcEntry } from "./gameShape";

describe("isAllowedGameSrcEntry — editor-import-graph modules", () => {
  test("accepts the enumerated editor modules and their tests", () => {
    for (const name of [
      "editorLayers.ts",
      "editorLayers.test.ts",
      "editorCatalogs.ts",
      "editorCatalogs.test.ts",
      "editorKinds.ts",
      "editorKinds.test.ts",
    ]) {
      expect(isAllowedGameSrcEntry(name, false)).toBe(true);
    }
  });

  test("accepts a not-yet-enumerated editor<Name>.ts module by convention (no gate re-trip on new modules)", () => {
    for (const name of [
      "editorBrushes.ts",
      "editorBrushes.test.ts",
      "editorTools.tsx",
      "editorZones.test.tsx",
    ]) {
      expect(isAllowedGameSrcEntry(name, false)).toBe(true);
    }
  });

  test("does not open the door to arbitrary top-level game modules", () => {
    for (const name of ["combat.ts", "editor.ts", "editors.ts", "myEditorThing.ts", "editorstuff.ts"]) {
      expect(isAllowedGameSrcEntry(name, false)).toBe(false);
    }
  });

  test("directories still limited to the skeleton dirs", () => {
    expect(isAllowedGameSrcEntry("game", true)).toBe(true);
    expect(isAllowedGameSrcEntry("editorLayers.ts", true)).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";

import { MATERIAL_LIBRARY } from "@jgengine/assets/catalogs/materialLibrary";

import { MATERIAL_SHEET_FLAT } from "./materialLibraryFlat";

describe("material sheet flat colours", () => {
  test("every group the library uses has a flat stand-in colour", () => {
    for (const entry of MATERIAL_LIBRARY) expect(MATERIAL_SHEET_FLAT[entry.group]).toMatch(/^#[0-9a-f]{6}$/);
  });
});

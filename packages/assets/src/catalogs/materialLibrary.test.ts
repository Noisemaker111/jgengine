import { describe, expect, test } from "bun:test";

import { validateMaterialAsset } from "@jgengine/core/material/materialAsset";

import {
  MATERIAL_LIBRARY,
  filterLibraryMaterials,
  findLibraryMaterial,
  libraryMaterialAsset,
  libraryMaterialMaps,
  libraryMaterialRoles,
} from "./materialLibrary";
import { sourceById } from "../sources";

describe("shared material library", () => {
  test("ships more than 40 named materials", () => {
    expect(MATERIAL_LIBRARY.length).toBeGreaterThanOrEqual(40);
    expect(new Set(MATERIAL_LIBRARY.map((entry) => entry.name)).size).toBe(MATERIAL_LIBRARY.length);
  });

  test("covers every surface the epic names", () => {
    const names = new Set(MATERIAL_LIBRARY.map((entry) => entry.name));
    for (const name of [
      "asphalt/wet", "metal/painted", "stucco/painted", "brick/red", "wood/oak",
      "foliage/leaf", "glass/clear", "water/ocean", "ground/sand", "concrete/smooth",
    ]) expect(names.has(name)).toBe(true);
    const titles = MATERIAL_LIBRARY.map((entry) => `${entry.name} ${entry.title}`.toLowerCase());
    expect(titles.some((title) => title.includes("asphalt") && title.includes("wet"))).toBe(true);
  });

  test("every scanned entry names a declared ambientCG source with its maps", () => {
    for (const entry of MATERIAL_LIBRARY) {
      if (entry.source === undefined) continue;
      const source = sourceById.get(entry.source);
      expect(source, entry.name).toBeDefined();
      expect(source!.kind).toBe("material");
      expect(source!.license).toBe("CC0-1.0");
      expect(source!.download).toBeDefined();
      expect(libraryMaterialRoles(entry)).toContain("color");
      expect(libraryMaterialRoles(entry)).toContain("normal");
    }
  });

  test("glass and water are shader surfaces, not invented downloads", () => {
    for (const name of ["glass/clear", "glass/frosted", "water/ocean", "water/puddle"]) {
      const entry = findLibraryMaterial(name)!;
      expect(entry.source).toBeUndefined();
      expect(libraryMaterialRoles(entry)).toEqual([]);
    }
    expect(findLibraryMaterial("glass/smudged")!.source).toBe("ambientcg-fingerprints001");
  });

  test("every entry builds a valid material asset whose maps match the pulled layout", () => {
    for (const entry of MATERIAL_LIBRARY) {
      const asset = libraryMaterialAsset(entry.name);
      expect(validateMaterialAsset(asset).filter((entry) => entry.severity === "error"), entry.name).toEqual([]);
      expect(asset.id).toBe(`library/${entry.name.replace(/\//g, "-")}`);
      const maps = libraryMaterialMaps(entry, { basePath: "/materials/" });
      for (const [role, metadata] of Object.entries(maps)) {
        if (entry.source === undefined) continue;
        expect(metadata!.url, `${entry.name} ${role}`).toStartWith(`/materials/${entry.source}/`);
        expect(metadata!.physicalSize).toEqual([entry.tileMetres, entry.tileMetres]);
      }
    }
  });

  test("foliage carries cut-out coverage and glass carries transmission", () => {
    const leaf = libraryMaterialAsset("foliage/leaf");
    expect(leaf.textures?.alpha?.url).toBe("/materials/ambientcg-leaf001/opacity.jpg");
    expect(leaf.surface.alphaMode).toBe("mask");
    expect(leaf.surface.doubleSided).toBe(true);
    expect(leaf.capabilities).toContain("alpha");
    const glass = libraryMaterialAsset("glass/clear");
    expect(glass.surface.transmission).toBe(1);
    expect(glass.capabilities).toContain("transmission");
    expect(glass.textures).toBeUndefined();
  });

  test("rejects unknown names and filters by group and text", () => {
    expect(findLibraryMaterial("asphalt/nope")).toBeNull();
    expect(() => libraryMaterialAsset("asphalt/nope")).toThrow(/Unknown library material/);
    expect(filterLibraryMaterials("wood").every((entry) => entry.group === "wood" || entry.name.includes("wood"))).toBe(true);
    expect(filterLibraryMaterials("", "metal").length).toBeGreaterThanOrEqual(8);
    expect(filterLibraryMaterials("nothing-matches-this").length).toBe(0);
  });

  test("never references Kenney", () => {
    const text = JSON.stringify(MATERIAL_LIBRARY).toLowerCase();
    expect(text.includes("kenney")).toBe(false);
  });
});

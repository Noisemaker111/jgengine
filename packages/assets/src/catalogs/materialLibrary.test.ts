import { describe, expect, test } from "bun:test";

import { validateMaterialAsset } from "@jgengine/core/material/materialAsset";

import {
  MATERIAL_LIBRARY,
  filterLibraryMaterials,
  findLibraryMaterial,
  libraryBuildingSurface,
  libraryMaterialAsset,
  libraryMaterialMaps,
  libraryMaterialRoles,
  librarySurfaceParameters,
  libraryTerrainMaterial,
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

  test("a macro ground variant tiles over tens of metres and arrives as grain, not as colour", () => {
    const fine = findLibraryMaterial("foliage/grass")!;
    const macro = findLibraryMaterial("foliage/grass-macro")!;
    expect(macro.source).toBe(fine.source);
    expect(macro.tileMetres).toBeGreaterThanOrEqual(20);
    expect(macro.tileMetres).toBeGreaterThan(fine.tileMetres * 5);
    expect(macro.terrain?.tint).toBeLessThan(1);
    expect(findLibraryMaterial("ground/dirt-macro")!.tileMetres).toBeGreaterThanOrEqual(20);
  });

  test("displacement is a published library role that terrain takes and the authored asset does not load", () => {
    const macro = findLibraryMaterial("foliage/grass-macro")!;
    expect(libraryMaterialRoles(macro)).toContain("displacement");
    expect(libraryMaterialMaps(macro).height).toBeUndefined();
    expect(libraryMaterialAsset("foliage/grass-macro").textures?.height).toBeUndefined();
    expect(libraryTerrainMaterial("foliage/grass-macro").maps.displacement).toBe("/materials/ambientcg-grass001/displacement.jpg");
    expect(libraryMaterialRoles(findLibraryMaterial("glass/smudged")!)).not.toContain("displacement");
  });

  test("libraryTerrainMaterial carries the entry's tiling, terrain policy and only the maps the archive ships", () => {
    const macro = libraryTerrainMaterial("foliage/grass-macro");
    expect(macro.repeat).toBe(24);
    expect(macro.tint).toBeLessThan(1);
    expect(macro.strength).toBeLessThan(1);
    expect(macro.maps.color).toBe("/materials/ambientcg-grass001/color.jpg");
    expect(macro.maps.displacement).toBe("/materials/ambientcg-grass001/displacement.jpg");

    const fingerprint = libraryTerrainMaterial("glass/smudged");
    expect(fingerprint.maps.displacement).toBeUndefined();
    expect(fingerprint.maps.roughness).toBe("/materials/ambientcg-fingerprints001/roughness.jpg");

    expect(libraryTerrainMaterial("foliage/grass", { repeat: 8, tint: 1 }).repeat).toBe(8);
    expect(libraryTerrainMaterial("foliage/grass", { tint: 1 }).tint).toBe(1);
    expect(() => libraryTerrainMaterial("glass/clear")).toThrow(/no pulled color\/normal maps/);
    expect(() => libraryTerrainMaterial("asphalt/nope")).toThrow(/Unknown library material/);
  });

  test("libraryBuildingSurface paints a part from a name at the entry's authored metres", () => {
    const surface = libraryBuildingSurface("brick/red", { slotMetres: [12, 3] });
    expect(surface.maps?.color).toBe("/materials/ambientcg-bricks004/color.jpg");
    expect(surface.maps?.normal).toBe("/materials/ambientcg-bricks004/normal.jpg");
    expect(surface.maps?.roughness).toBe("/materials/ambientcg-bricks004/roughness.jpg");
    expect(surface.maps?.ao).toBe("/materials/ambientcg-bricks004/ao.jpg");
    expect(surface.repeat).toEqual([12 / 1.6, 3 / 1.6]);
    expect(surface.roughness).toBe(0.86);
    expect(surface.metalness).toBe(0);

    expect(libraryBuildingSurface("brick/red").repeat).toBeUndefined();
    expect(libraryBuildingSurface("brick/red", { repeat: 3 }).repeat).toBe(3);
    expect(libraryBuildingSurface("asphalt/wet").color).toBe("#8f9498");
    expect(libraryBuildingSurface("asphalt/wet", { color: "#ffffff" }).color).toBe("#ffffff");
    expect(() => libraryBuildingSurface("water/ocean")).toThrow(/nothing to tile onto a building/);
    expect(() => libraryBuildingSurface("brick/nope")).toThrow(/Unknown library material/);
  });

  test("librarySurfaceParameters returns the entry's response without leaking the library's copy", () => {
    const parameters = librarySurfaceParameters("foliage/leaf");
    expect(parameters.alphaMode).toBe("mask");
    expect(parameters.sheenColor).toBe("#c8d18a");
    parameters.roughness = 0.1;
    expect(librarySurfaceParameters("foliage/leaf").roughness).toBe(0.55);
    expect(() => librarySurfaceParameters("nope/nope")).toThrow(/Unknown library material/);
  });
});

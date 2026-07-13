import { describe, expect, test } from "bun:test";
import { zipSync } from "fflate";

import { buildMaterialCatalog, extractMaterialMaps, materialAliases } from "./materials";
import { materialSources, sourceById } from "./sources";

const bytes = new Uint8Array([1, 2, 3]);

describe("extractMaterialMaps", () => {
  test("normalizes ambientCG map filenames by role", () => {
    const archive = zipSync({
      "Grass001_1K-JPG_Color.jpg": bytes,
      "Grass001_1K-JPG_NormalGL.jpg": bytes,
      "Grass001_1K-JPG_NormalDX.jpg": bytes,
      "Grass001_1K-JPG_Roughness.jpg": bytes,
      "Grass001_1K-JPG_AmbientOcclusion.jpg": bytes,
      "Grass001_1K-JPG_Displacement.jpg": bytes,
      "Grass001.mtlx": bytes,
    });
    const files = extractMaterialMaps(archive).map((map) => map.file);
    expect(files).toEqual(["ao.jpg", "color.jpg", "displacement.jpg", "normal.jpg", "roughness.jpg"]);
  });

  test("ignores unrelated archives", () => {
    const archive = zipSync({ "model.glb": bytes });
    expect(extractMaterialMaps(archive)).toEqual([]);
  });
});

describe("buildMaterialCatalog", () => {
  test("resolves ids to normalized map urls under basePath", () => {
    const catalog = buildMaterialCatalog({ basePath: "/materials" });
    const grass = catalog.resolve("ambientcg-grass001");
    expect(grass?.maps.color).toBe("/materials/ambientcg-grass001/color.jpg");
    expect(grass?.maps.normal).toBe("/materials/ambientcg-grass001/normal.jpg");
    expect(grass?.license).toBe("CC0-1.0");
  });

  test("resolves aliases to their target material", () => {
    const catalog = buildMaterialCatalog();
    expect(catalog.resolve("material/grass")?.id).toBe("ambientcg-grass001");
    expect(catalog.resolve("nope")).toBeNull();
  });

  test("every alias targets a real material source", () => {
    for (const alias of materialAliases) {
      expect(sourceById.get(alias.target)?.kind).toBe("material");
    }
  });

  test("catalog spans hundreds of CC0 materials with pinned downloads", () => {
    expect(materialSources.length).toBeGreaterThan(300);
    for (const source of materialSources) {
      expect(source.license).toBe("CC0-1.0");
      expect("url" in source.download && source.download.url).toContain("ambientcg.com/get?file=");
    }
  });
});

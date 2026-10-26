import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { compressedVariant, contentKey, imageVariantName, modelVariantName, parseImageVariant, roleFromName } from "./textureVariants";

mkdirSync(join(import.meta.dir, "../../.scratch"), { recursive: true });

describe("a texture's KTX2 twin", () => {
  test("a map's role comes from its file name", () => {
    expect(roleFromName("rock022/normal.jpg")).toBe("normal");
    expect(roleFromName("Bark_DeadTree_Normal.png")).toBe("normal");
    expect(roleFromName("T_Trim_03_BaseColor.png")).toBe("color");
    expect(roleFromName("color.jpg")).toBe("color");
    expect(roleFromName("roughness.jpg")).toBe("data");
    expect(roleFromName("ao.jpg")).toBe("data");
    expect(roleFromName("T_Trim_03_ORM.png")).toBe("data");
    // Short tokens only count as whole words: these are colour maps.
    expect(roleFromName("farm_texture.png")).toBe("color");
    expect(roleFromName("chaos_tiles.png")).toBe("color");
  });

  test("the query names a role and an orientation, or nothing", () => {
    expect(parseImageVariant("color,top", "a.png")).toEqual({ role: "color", orient: "top" });
    expect(parseImageVariant("auto,flip", "x/normal.jpg")).toEqual({ role: "normal", orient: "flip" });
    expect(parseImageVariant(null, "a.png")).toBeNull();
    expect(parseImageVariant("color", "a.png")).toBeNull();
    expect(parseImageVariant("albedo,top", "a.png")).toBeNull();
  });

  test("a server hands out the twin only when it exists and was asked for", () => {
    const root = mkdtempSync(join(import.meta.dir, "../../.scratch/jg-ktx2-"));
    try {
      const variants = join(root, ".ktx2");
      mkdirSync(variants);
      const image = join(root, "color.png");
      const model = join(root, "crate.glb");
      writeFileSync(image, "png bytes");
      writeFileSync(model, "glb bytes");
      const imageKey = contentKey(new TextEncoder().encode("png bytes"));
      const modelKey = contentKey(new TextEncoder().encode("glb bytes"));

      expect(compressedVariant(image, "ktx2=auto,top", variants)).toBeNull();
      expect(compressedVariant(model, "", variants)).toBeNull();

      const twin = join(variants, imageVariantName(imageKey, { role: "color", orient: "top" }));
      const modelTwin = join(variants, modelVariantName(modelKey, ".glb"));
      writeFileSync(twin, "ktx2");
      writeFileSync(modelTwin, "glb twin");
      expect(compressedVariant(image, "ktx2=auto,top", variants)).toBe(twin);
      expect(compressedVariant(image, "ktx2=color,flip", variants)).toBeNull();
      expect(compressedVariant(image, "", variants)).toBeNull();
      expect(compressedVariant(model, "v=3", variants)).toBe(modelTwin);
      // A model asked for as a KTX2 image is not one.
      expect(compressedVariant(model, "ktx2=color,top", variants)).toBeNull();
      expect(compressedVariant(join(root, "notes.txt"), "ktx2=color,top", variants)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

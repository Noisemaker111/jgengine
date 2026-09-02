import { describe, expect, test } from "bun:test";
import { classifyAssetFile, validateImportSpec } from "./importSpec";

describe("asset import spec", () => {
  test("validates safe multi-file entries", () => {
    const result = validateImportSpec({ id: "hero", kind: "model", files: [{ path: "hero.glb", role: "model" }] });
    expect(result.ok).toBe(true);
    expect(validateImportSpec({ id: "../hero", kind: "model", files: [{ path: "hero.glb" }] }).ok).toBe(false);
  });

  test("classifies representative magic bytes", () => {
    expect(classifyAssetFile(new TextEncoder().encode("glTF\0\0\0\0"), "hero.glb")).toBe("model");
    expect(classifyAssetFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "hero.png")).toBe("texture");
    expect(classifyAssetFile(new TextEncoder().encode("RIFFxxxxWAVE"), "shot.wav")).toBe("audio");
    expect(classifyAssetFile(new TextEncoder().encode('{"frames":{"hero":{}}}'), "sheet.json")).toBe("spriteSheet");
    expect(classifyAssetFile(new Uint8Array([1, 2, 3]), "unknown.bin")).toBeNull();
  });
});

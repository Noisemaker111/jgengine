import { describe, expect, test } from "bun:test";

import { applyImageTwins, encodableSize, modelImageRoles, modelImages, readGlb, writeGlb, type GltfJson } from "./compressTextures";

function model(): GltfJson {
  return {
    asset: { version: "2.0" },
    images: [{ uri: "albedo.png" }, { bufferView: 0, mimeType: "image/png" }, { uri: "normal.png" }],
    textures: [{ source: 0 }, { source: 1 }, { source: 2 }, { source: 0, extensions: { EXT_texture_webp: { source: 0 } } }],
    materials: [
      { pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicRoughnessTexture: { index: 1 } }, normalTexture: { index: 2 } },
      { occlusionTexture: { index: 1 } },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 5 }],
    buffers: [{ byteLength: 5 }],
  } as GltfJson;
}

describe("a model's textures get KTX2 twins", () => {
  test("each sampled image takes the role of its slot", () => {
    expect([...modelImageRoles(model())].sort()).toEqual([[0, "color"], [1, "data"], [2, "normal"]]);
  });

  test("embedded images are read out of the binary chunk", () => {
    const bin = new Uint8Array([1, 2, 3, 4, 5]);
    const images = modelImages(model(), "missing-dir", bin);
    // The file images are not on disk, so only the embedded one is found.
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ index: 1, role: "data", kind: "embedded" });
    expect([...(images[0] as { bytes: Uint8Array }).bytes]).toEqual([1, 2, 3, 4, 5]);
  });

  test("a twinned texture names its KTX2 image and keeps the original as the fallback", () => {
    const bin = new Uint8Array([1, 2, 3, 4, 5]);
    const out = applyImageTwins(model(), bin, new Map([
      [0, { kind: "file", uri: "albedo.png?ktx2=color,top" }],
      [1, { kind: "embedded", ktx2: new Uint8Array([9, 9, 9]) }],
    ] as const));
    expect(out.json.textures?.[0]).toEqual({ source: 0, extensions: { KHR_texture_basisu: { source: 3 } } });
    expect(out.json.textures?.[1]).toEqual({ source: 1, extensions: { KHR_texture_basisu: { source: 4 } } });
    expect(out.json.textures?.[2]).toEqual({ source: 2 });
    expect(out.json.textures?.[3]?.extensions).toEqual({ EXT_texture_webp: { source: 0 } });
    expect(out.json.images?.[3]).toEqual({ uri: "albedo.png?ktx2=color,top", mimeType: "image/ktx2" });
    expect(out.json.extensionsUsed).toContain("KHR_texture_basisu");
    expect(out.json.extensionsRequired).toBeUndefined();
    const view = out.json.bufferViews?.[1];
    expect(view).toEqual({ buffer: 0, byteOffset: 8, byteLength: 3 });
    expect([...out.bin!.subarray(8, 11)]).toEqual([9, 9, 9]);
    expect(out.json.buffers?.[0]?.byteLength).toBe(out.bin!.byteLength);
    // The model it came from is untouched.
    expect(model().textures?.[0]).toEqual({ source: 0 });
  });

  test("a GLB survives a write and a read", () => {
    const bin = new Uint8Array([1, 2, 3, 4, 5]);
    const back = readGlb(writeGlb(model(), bin));
    expect(back.json).toEqual(model());
    expect([...back.bin!.subarray(0, 5)]).toEqual([1, 2, 3, 4, 5]);
    expect(() => readGlb(new Uint8Array(12))).toThrow("not a GLB");
  });

  test("only block-aligned sizes are encoded", () => {
    expect(encodableSize(1024, 512)).toBe(true);
    expect(encodableSize(1023, 512)).toBe(false);
    expect(encodableSize(8192, 8192)).toBe(false);
  });
});

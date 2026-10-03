import { describe, expect, test } from "bun:test";
import type { GLTF } from "@gltf-transform/core";
import { inspectGlbMaterials, inspectGltfMaterials } from "./gltfMaterials";

function model(): GLTF.IGLTF {
  return {
    asset: { version: "2.0", copyright: "Original game artist", extras: { license: "CC-BY-4.0", source: "https://example.org/art" } },
    materials: [
      { name: "Skin", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicRoughnessTexture: { index: 1 } }, normalTexture: { index: 2 }, occlusionTexture: { index: 1 }, extras: { author: "Original game artist" } },
      { name: "Eyes", alphaMode: "BLEND", extensions: { KHR_materials_transmission: { transmissionFactor: 0.9, transmissionTexture: { index: 1 } }, KHR_materials_volume: { thicknessFactor: 0.1, thicknessTexture: { index: 1 } } } },
      { name: "Clothing", alphaMode: "MASK", alphaCutoff: 0.4, doubleSided: true, extensions: { KHR_materials_sheen: { sheenColorTexture: { index: 0 }, sheenRoughnessTexture: { index: 1 } }, KHR_materials_anisotropy: { anisotropyTexture: { index: 2 } } } },
      { name: "Metal", extensions: { KHR_materials_clearcoat: { clearcoatTexture: { index: 1 }, clearcoatRoughnessTexture: { index: 1 }, clearcoatNormalTexture: { index: 2 } }, KHR_materials_specular: { specularTexture: { index: 1 }, specularColorTexture: { index: 0 } } } },
    ],
    images: [{ uri: "character/base.png" }, { uri: "character/orm.png" }, { bufferView: 0, mimeType: "image/png" }],
    textures: [{ source: 0, sampler: 0 }, { source: 1 }, { source: 2 }],
    samplers: [{ wrapS: 33071, wrapT: 33648, minFilter: 9985, magFilter: 9728 }],
    meshes: [{ name: "Character", primitives: [0, 1, 2, 3].map((material) => ({ material, attributes: { POSITION: 0, NORMAL: 1, TANGENT: 2, TEXCOORD_0: 3 } })) }],
    nodes: [{ mesh: 0, name: "Hero" }, { mesh: 0, name: "Hero instance" }],
    extensionsUsed: ["KHR_materials_sheen", "KHR_materials_anisotropy", "KHR_materials_clearcoat", "KHR_materials_specular", "KHR_materials_transmission", "KHR_materials_volume"],
  };
}

describe("native glTF material inspection", () => {
  test("keeps independent slots, source attribution, alpha coverage and transmission", () => {
    const json = model();
    const before = JSON.stringify(json);
    const result = inspectGltfMaterials(json, "game/hero");
    expect(result.slots.map((slot) => slot.materialName)).toEqual(["Skin", "Eyes", "Clothing", "Metal"]);
    expect(result.slots[2]!.id).toBe("game/hero/mesh/0/primitive/2");
    expect(result.slots[2]!.materialId).toBe("game/hero/material/2");
    expect(result.slots[0]!.nodes).toEqual([{ index: 0, name: "Hero" }, { index: 1, name: "Hero instance" }]);
    expect(result.materials[1]!.alphaMode).toBe("BLEND");
    expect(result.materials[1]!.textures.find((texture) => texture.role === "transmission")!.metadata.channel).toBe("r");
    expect(result.materials[1]!.textures.find((texture) => texture.role === "thickness")!.metadata.channel).toBe("g");
    expect(result.materials[2]!.alphaCutoff).toBe(0.4);
    expect(result.materials[2]!.doubleSided).toBe(true);
    expect(result.copyright).toBe("Original game artist");
    expect(result.extras).toEqual(json.asset.extras);
    expect(result.diagnostics).toEqual([]);
    result.materials[0]!.native.name = "Edited snapshot";
    (result.extras as Record<string, unknown>).license = "changed";
    expect(JSON.stringify(json)).toBe(before);
  });

  test("interprets glTF packed channels and separates color maps from numeric data", () => {
    const result = inspectGltfMaterials(model(), "game/hero");
    const byRole = Object.fromEntries(result.materials.flatMap((material) => material.textures.map((texture) => [texture.role, texture])));
    for (const role of ["color", "emissive", "sheenColor", "specularColor"]) if (byRole[role] !== undefined) expect(byRole[role]!.metadata.colorSpace).toBe("srgb");
    expect(byRole.roughness!.metadata.channel).toBe("g");
    expect(byRole.metalness!.metadata.channel).toBe("b");
    expect(byRole.ao!.metadata.channel).toBe("r");
    expect(byRole.sheenRoughness!.metadata.channel).toBe("a");
    expect(byRole.specularIntensity!.metadata.channel).toBe("a");
    expect(byRole.clearcoatRoughness!.metadata.channel).toBe("g");
    expect(byRole.anisotropy!.channels).toEqual({ rg: "tangent direction [-1, 1]", b: "anisotropy strength" });
    expect(byRole.normal!.metadata.normalConvention).toBe("opengl");
    expect(byRole.normal!.bufferView).toBe(0);
    expect(byRole.normal!.metadata.url).toBeUndefined();
    expect(byRole.color!.metadata.sampler).toEqual({ wrapS: "clamp", wrapT: "mirror", minFilter: "linear-mipmap-nearest", magFilter: "nearest" });
  });

  test("retains texture transforms, UV overrides, compressed image source and raw extension data", () => {
    const json = model();
    json.images!.push({ uri: "character/base.ktx2", mimeType: "image/ktx2" });
    json.textures![0]!.extensions = { KHR_texture_basisu: { source: 3 } };
    const info = json.materials![0]!.pbrMetallicRoughness!.baseColorTexture!;
    info.texCoord = 0;
    info.extensions = { KHR_texture_transform: { offset: [0.25, 0.5], scale: [2, 3], rotation: Math.PI / 2, texCoord: 1 }, CUSTOM_editor: { originalPath: "Art/Hero.png" } };
    json.meshes![0]!.primitives[0]!.attributes.TEXCOORD_1 = 4;
    const texture = inspectGltfMaterials(json, "game/hero").materials[0]!.textures[0]!;
    expect(texture.image).toBe(3);
    expect(texture.metadata.url).toBe("character/base.ktx2");
    expect(texture.metadata.compression).toBe("basisu");
    expect(texture.metadata.uvSet).toBe(1);
    expect(texture.metadata.transform).toEqual({ offset: [0.25, 0.5], scale: [2, 3], rotation: Math.PI / 2 });
    expect(texture.native.extensions?.CUSTOM_editor).toEqual({ originalPath: "Art/Hero.png" });
    expect(inspectGltfMaterials(json, "game/hero").diagnostics).toEqual([]);
  });

  test("handles duplicate material names and default imported material without flattening", () => {
    const json = model();
    json.materials![1]!.name = "Skin";
    delete json.meshes![0]!.primitives[3]!.material;
    const result = inspectGltfMaterials(json, "hero");
    expect(result.materials[0]!.id).not.toBe(result.materials[1]!.id);
    expect(result.slots[3]!.materialId).toBeUndefined();
    expect(result.slots[3]!.material).toBeUndefined();
  });

  test("diagnoses unsupported extensions and missing directional prerequisites", () => {
    const json = model();
    json.extensionsUsed!.push("KHR_materials_variants", "KHR_materials_pbrSpecularGlossiness");
    json.extensionsRequired = ["KHR_materials_pbrSpecularGlossiness"];
    delete json.meshes![0]!.primitives[2]!.attributes.TANGENT;
    delete json.meshes![0]!.primitives[0]!.attributes.TEXCOORD_0;
    const result = inspectGltfMaterials(json, "game/hero");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "warning", code: "unsupported-extension", message: expect.stringContaining("KHR_materials_variants") }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", code: "unsupported-extension", message: expect.stringContaining("KHR_materials_pbrSpecularGlossiness") }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", code: "missing-tangent-space", path: "meshes[0].primitives[2]" }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", code: "missing-uv", path: "meshes[0].primitives[0]" }));
  });

  test("diagnoses incompatible unlit response and disconnected volume", () => {
    const json = model();
    json.materials![2]!.extensions!.KHR_materials_unlit = {};
    delete json.materials![1]!.extensions!.KHR_materials_transmission;
    const diagnostics = inspectGltfMaterials(json, "hero").diagnostics;
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "incompatible-extensions", severity: "error" }));
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "missing-transmission", severity: "warning" }));
    json.materials![2]!.extensions = { KHR_materials_unlit: {}, KHR_materials_emissive_strength: { emissiveStrength: 2 } };
    expect(inspectGltfMaterials(json, "hero").diagnostics).toContainEqual(expect.objectContaining({ code: "incompatible-extensions", path: "materials[2]" }));
    json.materials![2]!.extensions = { KHR_materials_pbrSpecularGlossiness: {}, KHR_materials_sheen: {} };
    expect(inspectGltfMaterials(json, "hero").diagnostics).toContainEqual(expect.objectContaining({ code: "incompatible-extensions", path: "materials[2]" }));
  });

  test("keeps native bump perturbation distinct from authored vertex displacement", () => {
    const json = model();
    json.extensionsUsed!.push("EXT_materials_bump");
    json.materials![0]!.extensions = { EXT_materials_bump: { bumpTexture: { index: 1 }, bumpFactor: 0.2 } };
    const material = inspectGltfMaterials(json, "hero").materials[0]!;
    expect(material.textures.find((texture) => texture.role === "bump")!.metadata).toMatchObject({ channel: "r", colorSpace: "linear" });
    expect(material.textures.some((texture) => texture.role === "height")).toBe(false);
    expect(material.native.extensions!.EXT_materials_bump).toEqual({ bumpTexture: { index: 1 }, bumpFactor: 0.2 });
  });

  test("fails precisely on unreadable references instead of inventing maps", () => {
    const json = model();
    json.materials![0]!.pbrMetallicRoughness!.baseColorTexture!.index = 99;
    expect(() => inspectGltfMaterials(json, "hero")).toThrow("materials[0].baseColorTexture: missing texture 99");
    json.materials![0]!.pbrMetallicRoughness!.baseColorTexture!.index = 0;
    json.materials![0]!.pbrMetallicRoughness!.baseColorTexture!.texCoord = 4;
    expect(() => inspectGltfMaterials(json, "hero")).toThrow("UV sets 0–3");
  });

  test("inspects compressed GLB metadata without a geometry decoder and rejects truncated bytes", () => {
    const json = model();
    json.extensionsRequired = ["KHR_draco_mesh_compression"];
    const text = new TextEncoder().encode(JSON.stringify(json));
    const size = Math.ceil(text.length / 4) * 4;
    const bytes = new Uint8Array(size + 20);
    const view = new DataView(bytes.buffer);
    for (const [offset, value] of [[0, 0x46546c67], [4, 2], [8, bytes.length], [12, size], [16, 0x4e4f534a]]) view.setUint32(offset!, value!, true);
    bytes.fill(32, 20);
    bytes.set(text, 20);
    expect(inspectGlbMaterials(bytes, "hero")).toEqual(inspectGltfMaterials(json, "hero"));
    expect(inspectGlbMaterials(bytes, "hero").diagnostics).toEqual([]);
    expect(() => inspectGlbMaterials(bytes.subarray(0, bytes.length - 4), "hero")).toThrow("complete GLB v2");
    view.setUint32(12, size + 4, true);
    expect(() => inspectGlbMaterials(bytes, "hero")).toThrow("Invalid GLB material chunk length");
  });
});

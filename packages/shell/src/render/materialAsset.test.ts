import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { type MaterialAsset } from "@jgengine/core/material/materialAsset";
import { applyMaterialAsset, applyMaterialAssignments, configureMaterialTexture, inspectModelMaterialSlots, materialResourceMetrics, setHairCardLightExposure } from "./materialAsset";
import { cloneModelScene, disposeModelScene } from "./modelRender";
import { applyMaterialOverride } from "../materialOverride";

function asset(id = "test-metal"): MaterialAsset {
  return { schemaVersion: 1, id, name: id, family: "metal", capabilities: ["pbr", "anisotropy", "clearcoat"], surface: { metalness: 0.95, roughness: 0.27, anisotropy: 0.8, anisotropyRotation: 0.4, clearcoat: 0.3 } };
}

describe("material assets render fidelity", () => {
  test("selected material slots isolate shared imports and register replacement cleanup", () => {
    const source = new THREE.Group();
    const skin = new THREE.MeshPhysicalMaterial({ color: "#eecbaa", transmission: 0.2, thickness: 0.1, sheen: 0.3, clearcoat: 0.8 });
    skin.name = "skin";
    const shirt = new THREE.MeshStandardMaterial({ color: "#004422" }); shirt.name = "shirt";
    const body = new THREE.Mesh(new THREE.BoxGeometry(), [skin, shirt]); body.name = "body";
    const hand = new THREE.Mesh(body.geometry, skin); hand.name = "hand";
    source.add(body, hand);
    const clone = cloneModelScene(source);
    const clonedBody = clone.getObjectByName("body") as THREE.Mesh;
    const clonedHand = clone.getObjectByName("hand") as THREE.Mesh;
    const before = [...clonedBody.material as THREE.Material[]];
    const replacements = applyMaterialAssignments(clone, [asset()], [{ materialId: "test-metal", selector: { mesh: "body", slot: "shirt", slotIndex: 1 } }]);
    const after = clonedBody.material as THREE.MeshPhysicalMaterial[];
    expect(after[0]).toBe(before[0]);
    expect(clonedHand.material).toBe(before[0]);
    expect(after[0]!.transmission).toBe(0.2);
    expect(after[0]!.sheen).toBe(0.3);
    expect(after[1]).not.toBe(before[1]);
    expect(after[1]!.isMeshPhysicalMaterial).toBe(true);
    expect(after[1]!.anisotropy).toBe(0.8);
    expect(after[1]!.clearcoat).toBe(0.3);
    expect(body.material).toEqual([skin, shirt]);
    let disposed = 0, sourceDisposed = 0;
    replacements[0]!.addEventListener("dispose", () => disposed++);
    skin.addEventListener("dispose", () => sourceDisposed++);
    disposeModelScene(clone);
    expect(disposed).toBe(1);
    expect(sourceDisposed).toBe(0);
    expect(inspectModelMaterialSlots(source).map(slot => [slot.mesh, slot.slot, slot.slotIndex])).toEqual([["body", "skin", 0], ["body", "shirt", 1], ["hand", "skin", 0]]);
  });

  test("sparse imported physical edits retain rich lobes, maps and texture ownership", () => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshPhysicalMaterial({ clearcoat: 0.7, sheen: 0.2, transmission: 0.4, thickness: 0.3, ior: 1.7, roughness: 0.2 });
    material.clearcoatMap = texture;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    applyMaterialOverride(mesh, { color: "#aabbcc" });
    const target = mesh.material as THREE.MeshPhysicalMaterial;
    expect(target).not.toBe(material);
    expect([target.clearcoat, target.sheen, target.transmission, target.thickness, target.ior]).toEqual([0.7, 0.2, 0.4, 0.3, 1.7]);
    expect(target.clearcoatMap).toBe(texture);
    expect(material.color.getHexString()).toBe("ffffff");
  });

  test("alpha coverage and volumetric transmission remain independent", () => {
    const source = new THREE.MeshStandardMaterial();
    const masked = applyMaterialAsset(source, { ...asset(), surface: { alphaMode: "mask", alphaCutoff: 0.4, transmission: 0.6, thickness: 0.2 }, capabilities: ["pbr", "alpha", "transmission", "volume"] });
    expect(masked.transparent).toBe(false);
    expect(masked.alphaTest).toBe(0.4);
    expect(masked.depthWrite).toBe(true);
    expect((masked as THREE.MeshPhysicalMaterial).transmission).toBe(0.6);
    const blended = applyMaterialAsset(source, { ...asset(), surface: { alphaMode: "blend", opacity: 0.3 }, capabilities: ["pbr", "alpha"] });
    expect(blended.transparent).toBe(true);
    expect(blended.alphaTest).toBe(0);
    expect(blended.depthWrite).toBe(false);
  });

  test("texture metadata implements sampler, UV transform, numeric channels and diagnostics", () => {
    const source = new THREE.Texture();
    const view = configureMaterialTexture("normal", { url: "normal.png", colorSpace: "linear", channel: "rgb", uvSet: 2, normalConvention: "directx", transform: { offset: [0.2, 0.3], scale: [2, 4], rotation: 0.4 }, sampler: { wrapS: "repeat", wrapT: "mirror", anisotropy: 8, minFilter: "linear-mipmap-linear", magFilter: "nearest" } }, source);
    expect(view.channel).toBe(2);
    expect(view.offset.toArray()).toEqual([0.2, 0.3]);
    expect(view.repeat.toArray()).toEqual([2, 4]);
    expect(view.rotation).toBe(0.4);
    expect(view.wrapS).toBe(THREE.RepeatWrapping);
    expect(view.wrapT).toBe(THREE.MirroredRepeatWrapping);
    expect(source.channel).toBe(0);
    expect(() => configureMaterialTexture("roughness", { url: "bad.png", channel: "r", colorSpace: "linear" }, source)).toThrow("requires g channels");
    expect(() => configureMaterialTexture("normal", { url: "bad.png", colorSpace: "srgb" }, source)).toThrow("requires linear");
    expect(() => configureMaterialTexture("normal", { url: "bad.ktx2", compression: "ktx2", colorSpace: "linear" }, source)).toThrow("requires the KTX2 loader");
  });

  test("fabric thread direction changes the shader and fuzzy uses a grazing sheen lobe", () => {
    const woven = { ...asset("woven"), family: "fabric" as const, surface: {}, capabilities: ["pbr", "anisotropy", "sheen"] as const, fabric: { construction: "woven" as const, weaveDirection: 0.5, threadScale: 100, normalStrength: 0.2, variation: 0.07 } };
    const material = applyMaterialAsset(new THREE.MeshStandardMaterial(), woven);
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <uv_vertex>", fragmentShader: "#include <common>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>" };
    material.onBeforeCompile(shader as never, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain("fwidth(jgThreads)");
    expect(shader.fragmentShader).toContain("normal = normalize(normal +");
    expect(shader.fragmentShader).toContain("roughnessFactor = clamp");
    expect((material as THREE.MeshPhysicalMaterial).anisotropyRotation).toBe(0.5);
    expect(material.customProgramCacheKey()).toContain("jg-fabric:v1");
    const fuzzy = applyMaterialAsset(new THREE.MeshStandardMaterial(), { ...woven, capabilities: ["pbr", "sheen"], fabric: { construction: "fuzzy" }, surface: { color: "#885544" } });
    expect((fuzzy as THREE.MeshPhysicalMaterial).sheen).toBe(1);
    expect((fuzzy as THREE.MeshPhysicalMaterial).anisotropy).toBe(0);
  });

  test("hair cards compile coverage, UV strand highlights and shadowed thin-sheet backlight", () => {
    const hair: MaterialAsset = { schemaVersion: 1, id: "hair", name: "hair", family: "hair", capabilities: ["pbr", "anisotropy", "alpha"], surface: { color: "#996633" }, hair: { geometry: "cards", strandDirection: Math.PI / 2, backlightStrength: 0.35 } };
    const material = applyMaterialAsset(new THREE.MeshStandardMaterial(), hair);
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <uv_vertex>", fragmentShader: "#include <common>\n#include <lights_physical_pars_fragment>" };
    material.onBeforeCompile(shader as never, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain("jgHairBack");
    expect(shader.fragmentShader).toContain("directLight.color * uJgHairTint");
    const nativeLighting = THREE.ShaderChunk.lights_physical_pars_fragment;
    const nativeBody = nativeLighting.slice(nativeLighting.indexOf("float dotNL =", nativeLighting.indexOf("void RE_Direct_Physical")));
    expect(shader.fragmentShader).toContain(nativeBody);
    expect(shader.fragmentShader.split("float jgHairBack =")).toHaveLength(2);
    expect(material.customProgramCacheKey()).toContain("jg-hair-cards:v2");
    setHairCardLightExposure(material, 0.4);
    expect((material.userData.jgHairBacklightUniform as { value: number }).value).toBeCloseTo(0.14);
    expect(material.alphaTest).toBe(0.5);
    expect(material.side).toBe(THREE.DoubleSide);
    expect((material as THREE.MeshPhysicalMaterial).anisotropyRotation).toBe(Math.PI / 2);
  });

  test("missing assets, selectors and UV prerequisites fail before editing the model", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); mesh.name = "object";
    const before = mesh.material;
    expect(() => applyMaterialAssignments(mesh, [], [{ materialId: "missing", selector: {} }])).toThrow("Unknown material");
    expect(() => applyMaterialAssignments(mesh, [asset()], [{ materialId: "test-metal", selector: { mesh: "missing" } }])).toThrow("matched no slots");
    mesh.geometry.deleteAttribute("uv");
    expect(() => applyMaterialAssignments(mesh, [asset()], [{ materialId: "test-metal", selector: { mesh: "object" } }])).toThrow("requires mesh UVs");
    expect(mesh.material).toBe(before);
  });


  test("last overlapping assignment wins without stacking procedural shader hooks", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); mesh.name = "cloth";
    const woven: MaterialAsset = { ...asset("cloth"), family: "fabric", capabilities: ["pbr", "sheen", "anisotropy"], surface: {}, fabric: { construction: "woven" } };
    const plain: MaterialAsset = { ...asset("plain"), capabilities: ["pbr"], surface: { color: "#112233" } };
    const owned = applyMaterialAssignments(mesh, [woven, plain], [{ materialId: "cloth", selector: { mesh: "cloth" } }, { materialId: "plain", selector: {} }]);
    expect(owned.length).toBe(1);
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("112233");
    expect(mesh.material.customProgramCacheKey()).not.toContain("jg-fabric");
    const first = applyMaterialAsset(new THREE.MeshStandardMaterial(), woven);
    const second = applyMaterialAsset(first, woven);
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <uv_vertex>", fragmentShader: "#include <common>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>" };
    second.onBeforeCompile(shader as never, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader.split("uniform vec4 uJgFabric;").length - 1).toBe(1);
  });

  test("DirectX normal conventions flip owned main and clearcoat responses", () => {
    const source = new THREE.MeshPhysicalMaterial(); source.normalScale.set(0.3, 0.6); source.clearcoatNormalScale.set(0.5, 0.7);
    const target = applyMaterialAsset(source, { ...asset(), textures: { normal: { url: "normal.png", colorSpace: "linear", normalConvention: "directx" }, clearcoatNormal: { url: "coat.png", colorSpace: "linear", normalConvention: "directx" } } }) as THREE.MeshPhysicalMaterial;
    expect(target.normalScale.toArray()).toEqual([0.3, -0.6]);
    expect(target.clearcoatNormalScale.toArray()).toEqual([0.5, -0.7]);
    expect(source.normalScale.toArray()).toEqual([0.3, 0.6]);
  });

  test("resource metrics count shared texture views once and mark unknown dimensions", () => {
    const texture = new THREE.Texture({ width: 512, height: 512 });
    const material = new THREE.MeshPhysicalMaterial({ transmission: 0.5, transparent: true, side: THREE.DoubleSide });
    material.map = texture; material.roughnessMap = texture;
    const other = new THREE.MeshStandardMaterial({ normalMap: new THREE.Texture() });
    const metrics = materialResourceMetrics([material, material, other]);
    expect(metrics).toEqual({ materials: 2, textures: 2, textureBytes: 1398100, unknownTextureSizes: 1, blendedMaterials: 1, maskedMaterials: 0, transmissionMaterials: 1, doubleSidedMaterials: 1, physicalMaterials: 1 });
  });
});

test("material asset mounts dispose their owned map views and preserve loader sources", async () => {
  const { act, createRoot } = await import("@react-three/fiber");
  const { createElement, Suspense } = await import("react");
  const { useMaterialAssetMaterial } = await import("./materialAsset");
  const source = new THREE.Texture();
  let sourceDisposals = 0;
  source.addEventListener("dispose", () => sourceDisposals++);
  const originalLoad = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = (_url, onLoad) => { onLoad?.(source); return source as THREE.Texture<HTMLImageElement>; };
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT; environment.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({ frameloop: "never", size: { width: 100, height: 100, top: 0, left: 0 }, dpr: 1, gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as THREE.WebGLRenderer });
  let material!: THREE.MeshStandardMaterial;
  function Surface({ color }: { color: string }) {
    material = useMaterialAssetMaterial({ ...asset("mounted"), surface: { color, clearcoat: 0.4 }, textures: { color: { url: "owned-asset-color.png", colorSpace: "srgb" }, roughness: { url: "owned-asset-roughness.png", colorSpace: "linear" } } });
    return createElement("primitive", { object: material });
  }
  const render = async (color: string) => act(async () => root.render(createElement(Suspense, { fallback: null }, createElement(Surface, { color }))));
  try {
    await render("#ffffff");
    const first = material;
    expect(first.map).not.toBe(source);
    expect(first.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(first.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);
    expect((first as THREE.MeshPhysicalMaterial).clearcoat).toBe(0.4);
    let released = 0;
    first.addEventListener("dispose", () => released++);
    first.map!.addEventListener("dispose", () => released++);
    first.roughnessMap!.addEventListener("dispose", () => released++);
    await render("#ffffff"); expect(material).toBe(first);
    await render("#123456"); expect(material).not.toBe(first); expect(released).toBe(3);
    let lastReleased = 0;
    material.addEventListener("dispose", () => lastReleased++);
    material.map!.addEventListener("dispose", () => lastReleased++);
    material.roughnessMap!.addEventListener("dispose", () => lastReleased++);
    await act(async () => root.render(null));
    expect(lastReleased).toBe(3);
    expect(sourceDisposals).toBe(0);
    expect(source.colorSpace).toBe(THREE.NoColorSpace);
    expect(source.flipY).toBe(true);
  } finally {
    await act(async () => root.unmount());
    THREE.TextureLoader.prototype.load = originalLoad; environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

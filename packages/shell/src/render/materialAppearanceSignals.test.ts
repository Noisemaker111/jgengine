import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import type { EnvironmentSample } from "@jgengine/core/world/envField";
import { createMaterialTemplate } from "@jgengine/core/material/materialAsset";
import { applyMaterialAsset } from "./materialAsset";
import { cloneModelScene, disposeModelScene } from "./modelRender";
import { applyMaterialAppearanceSignals, captureMaterialAppearanceBaseline, restoreMaterialAppearanceBaseline } from "./materialAppearanceSignals";

const sample = (wetness: number, lightExposure = 1): EnvironmentSample => ({ temperature: 20, wetness, lightExposure, ambientLight: 0.5, sheltered: false });

describe("owned material environment response", () => {
  test("cloned authored cards bind exposure and reset to each instance's compiled uniform", () => {
    const imported = new THREE.MeshPhysicalMaterial({ transmission: 0.2, clearcoat: 0.4, iridescence: 0.3 });
    const receivers: THREE.Material[] = [];
    imported.onBeforeCompile = function () { receivers.push(this); };
    imported.customProgramCacheKey = () => "imported-cards:v1";
    const authored = applyMaterialAsset(imported, createMaterialTemplate("hair-cards", "cards"));
    const source = new THREE.Mesh(new THREE.PlaneGeometry(), authored);
    const compile = (material: THREE.Material) => {
      const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
      material.onBeforeCompile(shader as never, {} as THREE.WebGLRenderer);
      return shader.uniforms.uJgHairBacklight!;
    };
    const originalUniform = compile(authored);
    const first = cloneModelScene(source) as THREE.Mesh, second = cloneModelScene(source) as THREE.Mesh;
    const a = first.material as THREE.MeshPhysicalMaterial, b = second.material as THREE.MeshPhysicalMaterial;
    const baselineA = captureMaterialAppearanceBaseline(a), baselineB = captureMaterialAppearanceBaseline(b);
    const uniformA = compile(a), uniformB = compile(b);
    try {
      expect(receivers).toEqual([authored, a, b]);
      expect(a.customProgramCacheKey()).toBe(authored.customProgramCacheKey());
      applyMaterialAppearanceSignals(a, baselineA, sample(0, 0.2), { cardBacklightExposure: true });
      expect(uniformA.value).toBeCloseTo(0.05);
      expect(uniformB.value).toBe(0.25);
      applyMaterialAppearanceSignals(b, baselineB, sample(0, 0.6), { cardBacklightExposure: true });
      expect(uniformB.value).toBeCloseTo(0.15);
      expect(uniformA.value).toBeCloseTo(0.05);
      restoreMaterialAppearanceBaseline(a, baselineA);
      expect(uniformA.value).toBe(0.25);
      expect(uniformB.value).toBeCloseTo(0.15);
      restoreMaterialAppearanceBaseline(b, baselineB);
      expect(uniformB.value).toBe(0.25);
      expect(authored.userData.jgHairBacklightUniform).toBe(originalUniform);
      expect(originalUniform.value).toBe(0.25);
      expect([a.transmission, b.clearcoat, authored.iridescence]).toEqual([0.2, 0.4, 0.3]);
    } finally { disposeModelScene(first); disposeModelScene(second); authored.dispose(); imported.dispose(); source.geometry.dispose(); }
  });

  test("wet updates preserve imported features, texture sharing and source slots without drift", () => {
    const map = new THREE.Texture();
    const imported = new THREE.MeshPhysicalMaterial({ roughness: 0.8, color: "#937b65", sheen: 0.6, clearcoat: 0.3, transmission: 0.2, ior: 1.7, thickness: 0.2, alphaTest: 0.5, map });
    const material = imported.clone();
    const baseline = captureMaterialAppearanceBaseline(material);
    const policy = { wetness: { roughness: 0.2, colorRetention: 0.5, sheen: 0.1, clearcoat: { strength: 0.8, roughness: 0.1 } } };
    const version = material.version;
    for (let index = 0; index < 20; index++) applyMaterialAppearanceSignals(material, baseline, sample(0.5), policy);
    expect(material.roughness).toBeCloseTo(0.5);
    expect(material.color.r).toBeCloseTo(baseline.colorLinear[0] * 0.75);
    expect(material.clearcoat).toBeCloseTo(0.55);
    expect(material.version).toBe(version);
    expect([material.transmission, material.ior, material.thickness, material.alphaTest]).toEqual([0.2, 1.7, 0.2, 0.5]);
    expect(material.map).toBe(map);
    expect(imported.roughness).toBe(0.8);
    expect(imported.color.getHexString()).toBe("937b65");
    restoreMaterialAppearanceBaseline(material, baseline);
    expect(material.color.equals(imported.color)).toBe(true);
    expect([material.roughness, material.sheen, material.clearcoat]).toEqual([0.8, 0.6, 0.3]);
    let disposed = 0;
    map.addEventListener("dispose", () => disposed++);
    material.dispose();
    expect(disposed).toBe(0);
  });

  test("roughness-only standard response creates no physical shader or material", () => {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const baseline = captureMaterialAppearanceBaseline(material);
    const version = material.version;
    applyMaterialAppearanceSignals(material, baseline, sample(1), { wetness: { roughness: 0.3 } });
    expect(material.roughness).toBe(0.3);
    expect(material.version).toBe(version);
    expect((material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial).toBeUndefined();
    expect(() => applyMaterialAppearanceSignals(material, baseline, sample(1), { wetness: { roughness: 0.1, clearcoat: { strength: 1 } } })).toThrow("MeshPhysicalMaterial");
    expect(material.roughness).toBe(0.3);
  });

  test("explicit coat activation pays a shader variant transition, never a transmission pass", () => {
    const material = new THREE.MeshPhysicalMaterial({ roughness: 0.8 });
    const baseline = captureMaterialAppearanceBaseline(material);
    const start = material.version;
    applyMaterialAppearanceSignals(material, baseline, sample(1), { wetness: { roughness: 0.3 } });
    expect(material.version).toBe(start);
    expect(material.clearcoat).toBe(0);
    applyMaterialAppearanceSignals(material, baseline, sample(1), { wetness: { clearcoat: { strength: 0.8 } } });
    expect(material.version).toBe(start + 1);
    applyMaterialAppearanceSignals(material, baseline, sample(0.5), { wetness: { clearcoat: { strength: 0.8 } } });
    expect(material.version).toBe(start + 1);
    expect(material.transmission).toBe(0);
    restoreMaterialAppearanceBaseline(material, baseline);
    expect(material.version).toBe(start + 2);
    expect(material.clearcoat).toBe(0);
  });

  test("card exposure reaches compiled and future shader uniforms without scene changes", () => {
    const material = applyMaterialAsset(new THREE.MeshStandardMaterial(), createMaterialTemplate("hair-cards", "cards"));
    const baseline = captureMaterialAppearanceBaseline(material);
    applyMaterialAppearanceSignals(material, baseline, sample(0, 0.2), { cardBacklightExposure: true });
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    material.onBeforeCompile(shader as unknown as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
    expect((shader.uniforms as Record<string, { value: number }>).uJgHairBacklight!.value).toBeCloseTo(0.05);
    const version = material.version;
    applyMaterialAppearanceSignals(material, baseline, sample(0, 0.6), { cardBacklightExposure: true });
    expect((shader.uniforms as Record<string, { value: number }>).uJgHairBacklight!.value).toBeCloseTo(0.15);
    expect(material.version).toBe(version);
    restoreMaterialAppearanceBaseline(material, baseline);
    expect((shader.uniforms as Record<string, { value: number }>).uJgHairBacklight!.value).toBe(0.25);
  });
});

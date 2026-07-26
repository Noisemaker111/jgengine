import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { applyMaterialOverride } from "./materialOverride";

const BASE_FRAGMENT = "#include <common>\n#include <opaque_fragment>";

function meshWithStandardMaterial(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#ffffff" }));
}

describe("applyMaterialOverride", () => {
  test("clones the standard material and applies color/metalness/roughness", () => {
    const mesh = meshWithStandardMaterial();
    const original = mesh.material as THREE.MeshStandardMaterial;
    applyMaterialOverride(mesh, { color: "#ff0000", metalness: 0.8, roughness: 0.2 });
    const applied = mesh.material as THREE.MeshStandardMaterial;
    expect(applied).not.toBe(original);
    expect(`#${applied.color.getHexString()}`).toBe("#ff0000");
    expect(applied.metalness).toBeCloseTo(0.8, 5);
    expect(applied.roughness).toBeCloseTo(0.2, 5);
  });

  test("applies emissive color and intensity", () => {
    const mesh = meshWithStandardMaterial();
    applyMaterialOverride(mesh, { emissive: "#00ff00", emissiveIntensity: 2 });
    const applied = mesh.material as THREE.MeshStandardMaterial;
    expect(`#${applied.emissive.getHexString()}`).toBe("#00ff00");
    expect(applied.emissiveIntensity).toBe(2);
  });

  test("leaves non-standard materials untouched", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: "#0000ff" }));
    const original = mesh.material;
    applyMaterialOverride(mesh, { color: "#ff0000" });
    expect(mesh.material).toBe(original);
  });

  test("traverses nested groups and overrides every standard-material mesh", () => {
    const group = new THREE.Group();
    const childA = meshWithStandardMaterial();
    const childB = meshWithStandardMaterial();
    group.add(childA, childB);
    applyMaterialOverride(group, { color: "#123456" });
    expect(`#${(childA.material as THREE.MeshStandardMaterial).color.getHexString()}`).toBe("#123456");
    expect(`#${(childB.material as THREE.MeshStandardMaterial).color.getHexString()}`).toBe("#123456");
  });

  test("does not mutate the shared source material", () => {
    const sharedMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff" });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sharedMaterial);
    applyMaterialOverride(mesh, { color: "#ff0000" });
    expect(`#${sharedMaterial.color.getHexString()}`).toBe("#ffffff");
  });

  test("handles an array of materials, overriding only the standard ones", () => {
    const standard = new THREE.MeshStandardMaterial({ color: "#ffffff" });
    const basic = new THREE.MeshBasicMaterial({ color: "#0000ff" });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [standard, basic]);
    applyMaterialOverride(mesh, { color: "#ff0000" });
    const materials = mesh.material as THREE.Material[];
    expect(`#${(materials[0] as THREE.MeshStandardMaterial).color.getHexString()}`).toBe("#ff0000");
    expect(materials[1]).toBe(basic);
  });

  test("applies loaded PBR textures onto map/normalMap/roughnessMap/aoMap", () => {
    const mesh = meshWithStandardMaterial();
    const versionBefore = (mesh.material as THREE.MeshStandardMaterial).version;
    const textures = {
      color: new THREE.Texture(),
      normal: new THREE.Texture(),
      roughness: new THREE.Texture(),
      ao: new THREE.Texture(),
    };
    applyMaterialOverride(mesh, {}, { textures });
    const applied = mesh.material as THREE.MeshStandardMaterial;
    expect(applied.map).toBe(textures.color);
    expect(applied.normalMap).toBe(textures.normal);
    expect(applied.roughnessMap).toBe(textures.roughness);
    expect(applied.aoMap).toBe(textures.ao);
    expect(applied.version).toBeGreaterThan(versionBefore);
  });

  test("textures compose with a tint override on the same material", () => {
    const mesh = meshWithStandardMaterial();
    applyMaterialOverride(mesh, { roughness: 0.1 }, { textures: { color: new THREE.Texture() } });
    const applied = mesh.material as THREE.MeshStandardMaterial;
    expect(applied.roughness).toBeCloseTo(0.1, 5);
    expect(applied.map).not.toBeNull();
    expect(applied.normalMap).toBeNull();
  });

  test("without a textures option, map/normalMap/roughnessMap/aoMap are left alone", () => {
    const mesh = meshWithStandardMaterial();
    applyMaterialOverride(mesh, { color: "#ff0000" });
    const applied = mesh.material as THREE.MeshStandardMaterial;
    expect(applied.map).toBeNull();
    expect(applied.normalMap).toBeNull();
  });

  test("a rim override injects the fresnel term and its uniforms", () => {
    const mesh = meshWithStandardMaterial();
    applyMaterialOverride(mesh, { rim: { color: "#9fd0ff", strength: 0.8, power: 3 } });
    const applied = mesh.material as THREE.MeshStandardMaterial;
    const shader = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: BASE_FRAGMENT };
    applied.onBeforeCompile?.(shader as never, undefined as never);

    expect((shader.uniforms.uJgRimColor?.value as THREE.Color).getHexString()).toBe("9fd0ff");
    expect(shader.uniforms.uJgRimStrength?.value).toBeCloseTo(0.8, 5);
    expect(shader.uniforms.uJgRimPower?.value).toBeCloseTo(3, 5);
    expect(shader.fragmentShader).toContain("outgoingLight += uJgRimColor * jgRim * uJgRimStrength");
  });

  test("rim tuning is part of the program cache key so two rims cannot share a program", () => {
    const a = meshWithStandardMaterial();
    const b = meshWithStandardMaterial();
    applyMaterialOverride(a, { rim: { color: "#ff0000", strength: 1 } });
    applyMaterialOverride(b, { rim: { color: "#0000ff", strength: 1 } });
    const keyA = (a.material as THREE.MeshStandardMaterial).customProgramCacheKey();
    const keyB = (b.material as THREE.MeshStandardMaterial).customProgramCacheKey();
    expect(keyA).not.toBe(keyB);
  });

  test("a zero-strength rim compiles nothing", () => {
    const mesh = meshWithStandardMaterial();
    applyMaterialOverride(mesh, { rim: { strength: 0 } });
    const applied = mesh.material as THREE.MeshStandardMaterial;
    const shader = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: BASE_FRAGMENT };
    applied.onBeforeCompile?.(shader as never, undefined as never);
    expect(shader.fragmentShader).not.toContain("uJgRimColor");
  });

  test("omitting rim leaves the material's shader untouched", () => {
    const mesh = meshWithStandardMaterial();
    applyMaterialOverride(mesh, { color: "#ff0000" });
    const applied = mesh.material as THREE.MeshStandardMaterial;
    const shader = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: BASE_FRAGMENT };
    applied.onBeforeCompile?.(shader as never, undefined as never);
    expect(shader.fragmentShader).toBe(BASE_FRAGMENT);
  });
});

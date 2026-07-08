import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { applyMaterialOverride } from "./materialOverride";

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
});

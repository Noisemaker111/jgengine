import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { resolveGraphicsProfile } from "@jgengine/core/settings/graphicsProfile";
import { buildingChunkWithinBudget, resolveBuildingRenderPolicy } from "./BuildingRenderBudget";

describe("generated building distance policy", () => {
  test("uses each existing graphics-tier distance and explicit visibility precedence", () => {
    for (const quality of ["low", "medium", "high", "ultra"] as const) {
      expect(resolveBuildingRenderPolicy(resolveGraphicsProfile(quality).drawDistance).maxDistance).toBe(resolveGraphicsProfile(quality).drawDistance);
    }
    expect(resolveBuildingRenderPolicy(120, { culling: { defaultMaxRenderDistance: 350 } }).maxDistance).toBe(350);
    expect(resolveBuildingRenderPolicy(120, { culling: { defaultMaxRenderDistance: 350 }, scene: { maxRenderDistance: 700 } }).maxDistance).toBe(700);
    expect(resolveBuildingRenderPolicy(120, { scene: { maxRenderDistance: Infinity } }).maxDistance).toBe(Infinity);
    expect(resolveBuildingRenderPolicy(120, { scene: { minRenderDistance: 10 } }).minDistance).toBe(10);
    expect(resolveBuildingRenderPolicy(resolveGraphicsProfile("low", { drawDistance: 333 }).drawDistance).maxDistance).toBe(333);
  });

  test("honors all distance bypass switches without applying a main-camera frustum gate", () => {
    for (const config of [
      { enabled: false }, { culling: { enabled: false } }, { culling: { distanceCulling: false } },
      { scene: { alwaysVisible: true } }, { scene: { cullingDisabled: true } },
      { scene: { customVisibility: () => true } },
    ]) expect(resolveBuildingRenderPolicy(120, config).enabled).toBe(false);
    expect(resolveBuildingRenderPolicy(120, { culling: { frustumCulling: false } }).enabled).toBe(true);
    expect(resolveBuildingRenderPolicy(120, undefined, true).enabled).toBe(false);
  });

  test("includes actual transformed bounds, restores visibility after policy changes, and applies hysteresis only while visible", () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    const worldBounds = new THREE.Box3();
    const sphere = new THREE.Sphere();
    const camera = new THREE.Vector3();
    const matrix = new THREE.Matrix4().makeTranslation(123, 0, 0);
    const policy = resolveBuildingRenderPolicy(120);
    const visible = (previous: boolean, activePolicy = policy) =>
      buildingChunkWithinBudget(bounds, matrix, camera, activePolicy, previous, worldBounds, sphere);
    expect(visible(false)).toBe(false);
    expect(visible(true)).toBe(true);
    expect(visible(false, resolveBuildingRenderPolicy(240))).toBe(true);
    matrix.makeTranslation(10000, 0, 0);
    expect(visible(false, resolveBuildingRenderPolicy(Infinity))).toBe(true);
    expect(visible(false, resolveBuildingRenderPolicy(120, { enabled: false }))).toBe(true);
    matrix.makeScale(100, 1, 1).setPosition(200, 0, 0);
    expect(visible(false)).toBe(true);
    expect(worldBounds.min.x).toBe(100);
  });

  test("renderer sphere remains conservative under nested nonuniform parent shear even when distance culling is disabled", () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    const parent = new THREE.Group();
    parent.scale.set(3, 1, 1);
    const child = new THREE.Group();
    child.rotation.z = Math.PI / 4;
    parent.add(child);
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.InstancedMesh(geometry, material, 1);
    mesh.setMatrixAt(0, new THREE.Matrix4());
    mesh.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
    child.add(mesh);
    mesh.updateWorldMatrix(true, false);
    const attribute = geometry.getAttribute("position");
    const points = Array.from({ length: attribute.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(attribute, index).applyMatrix4(mesh.matrixWorld));
    const before = mesh.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
    expect(points.some((point) => before.distanceToPoint(point) > 0.1)).toBe(true);
    expect(buildingChunkWithinBudget(bounds, mesh.matrixWorld, new THREE.Vector3(), resolveBuildingRenderPolicy(120, { enabled: false }), true, new THREE.Box3(), new THREE.Sphere(), mesh.boundingSphere)).toBe(true);
    const after = mesh.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
    for (const point of points) expect(after.distanceToPoint(point)).toBeLessThanOrEqual(1e-9);
    mesh.dispose();
    geometry.dispose();
    material.dispose();
  });
});

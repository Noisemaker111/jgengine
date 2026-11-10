import { expect, test } from "bun:test";
import { createElement, Suspense } from "react";
import * as THREE from "three";

import { mountTestDraws, type MountedTestDraws } from "@jgengine/core/frame/testEngineHost.draw";
import { registerGenerator } from "@jgengine/core/generator/generator";
import { PARTS_OUTPUT } from "@jgengine/core/scene/assetGenerator";
import { GeneratedAssetInstance } from "./GeneratedAssetRenderer.draw";

test("authored generator rendering retains transforms, material defaults, clamps and color draws", async () => {
  let mounted: MountedTestDraws | undefined;
  registerGenerator({ id: "render-test-bookcase", label: "test", output: PARTS_OUTPUT, schema: { fields: [] }, generate: () => ({
    parts: [
      { id: "shelf", position: [1, 2, 3], size: [2, 0.1, 1], rotationY: 0.6, color: "#123456" },
      { id: "board", position: [-1, 0, 0], size: [0, 2, 1], color: "#123456" },
      { id: "book", position: [0, 1, 0], size: [0.1, 0.5, 0.2] },
    ], bounds: { min: [-2, 0, -2], max: [2, 3, 3] },
  }) });
  try {
    mounted = await mountTestDraws(createElement(Suspense, { fallback: null }, createElement(GeneratedAssetInstance,
      { meta: { assetId: "render-test-bookcase" }, position: [12, 3, -4], rotationY: 0.2 })), { width: 100, height: 100 });
    for (let i = 0; i < 10; i += 1) await mounted.advance(1 / 60);
    const scene = mounted.scene;
    const group = scene.children[0]!;
    expect(group.position.toArray()).toEqual([12, 3, -4]);
    expect(group.rotation.y).toBe(0.2);
    const meshes: THREE.InstancedMesh[] = [];
    group.traverse((object) => {
      if ((object as THREE.InstancedMesh).isInstancedMesh === true) meshes.push(object as THREE.InstancedMesh);
    });
    expect(meshes.map(mesh => mesh.count)).toEqual([2, 1]);
    const material = meshes[0]!.material as THREE.MeshStandardMaterial;
    expect(material.color.getHexString()).toBe("123456");
    expect(material.roughness).toBe(0.62);
    expect(material.metalness).toBe(0.04);
    expect((meshes[1]!.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("b8b0a4");
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
    meshes[0]!.getMatrixAt(0, matrix); matrix.decompose(position, rotation, scale);
    expect(position.toArray()).toEqual([1, 2, 3]);
    expect(scale.x).toBeCloseTo(2);
    expect(new THREE.Euler().setFromQuaternion(rotation).y).toBeCloseTo(0.6);
    meshes[0]!.getMatrixAt(1, matrix); matrix.decompose(position, rotation, scale);
    expect(scale.x).toBeCloseTo(0.001);
    expect(meshes.every(mesh => mesh.castShadow && mesh.receiveShadow && mesh.boundingSphere !== null)).toBe(true);
  } finally {
    await mounted?.unmount();
  }
});

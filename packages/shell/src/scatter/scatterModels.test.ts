import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { buildScatterModelSources, disposeScatterModelSources } from "./scatterModels";

function meshScene(): { scene: THREE.Group; mesh: THREE.Mesh } {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: "#3f6b30" }));
  scene.add(mesh);
  return { scene, mesh };
}

describe("buildScatterModelSources", () => {
  test("harvests one source per mesh, geometry left unowned by the loader cache", () => {
    const { scene, mesh } = meshScene();
    const { sources } = buildScatterModelSources(scene, { url: "tree.glb" });
    expect(sources.length).toBe(1);
    expect(sources[0]!.geometry).toBe(mesh.geometry);
  });

  test("bakes the mesh's own local transform into localMatrix", () => {
    const { scene, mesh } = meshScene();
    mesh.position.set(1, 0.5, -2);
    const { sources } = buildScatterModelSources(scene, { url: "tree.glb" });
    const position = new THREE.Vector3().setFromMatrixPosition(sources[0]!.localMatrix);
    expect(position.x).toBeCloseTo(1, 5);
    expect(position.y).toBeCloseTo(0.5, 5);
    expect(position.z).toBeCloseTo(-2, 5);
  });

  test("targetHeight normalizes scale and centers on the measured bounding box", () => {
    const { scene } = meshScene();
    const model: ModelConfig = { url: "tree.glb", targetHeight: 4 };
    const { sources } = buildScatterModelSources(scene, model);
    const scale = new THREE.Vector3().setFromMatrixScale(sources[0]!.localMatrix);
    expect(scale.x).toBeCloseTo(2, 5);
    const position = new THREE.Vector3().setFromMatrixPosition(sources[0]!.localMatrix);
    expect(position.x).toBeCloseTo(0, 5);
    expect(position.z).toBeCloseTo(0, 5);
  });

  test("anchor center uses dims when no targetHeight is given", () => {
    const { scene } = meshScene();
    const model: ModelConfig = {
      url: "tree.glb",
      dims: { footprint: { w: 1, d: 1 }, center: { x: 0.4, z: -0.2 }, minY: -0.1 },
    };
    const { sources } = buildScatterModelSources(scene, model);
    const position = new THREE.Vector3().setFromMatrixPosition(sources[0]!.localMatrix);
    expect(position.x).toBeCloseTo(-0.4, 5);
    expect(position.y).toBeCloseTo(0.1, 5);
    expect(position.z).toBeCloseTo(0.2, 5);
  });

  test("clones materials so the shared loader-cache scene stays untouched", () => {
    const { scene, mesh } = meshScene();
    const original = mesh.material as THREE.MeshStandardMaterial;
    const { sources } = buildScatterModelSources(scene, { url: "tree.glb", material: { color: "#ff0000" } });
    const material = sources[0]!.material as THREE.MeshStandardMaterial;
    expect(material).not.toBe(original);
    expect(`#${material.color.getHexString()}`).toBe("#ff0000");
    expect(`#${original.color.getHexString()}`).toBe("#3f6b30");
  });

  test("disposeScatterModelSources disposes the cloned root's materials only", () => {
    const { scene } = meshScene();
    const { root } = buildScatterModelSources(scene, { url: "tree.glb" });
    const clonedMaterial = (root.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    let disposed = false;
    const originalDispose = clonedMaterial.dispose.bind(clonedMaterial);
    clonedMaterial.dispose = () => {
      disposed = true;
      originalDispose();
    };
    disposeScatterModelSources(root);
    expect(disposed).toBe(true);
  });
});

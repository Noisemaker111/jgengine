import { expect, test } from "bun:test";
import * as THREE from "three";

import { setCulled, skipCulledMatrices } from "./culledTransforms.draw";

function marker(scene: THREE.Scene, x: number): { group: THREE.Group; mesh: THREE.Mesh } {
  const group = new THREE.Group();
  group.position.set(x, 0, 0);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.position.set(0, 2, 0);
  group.add(mesh);
  scene.add(group);
  return { group, mesh };
}

test("a culled marker leaves the scene's matrix pass and is rebuilt in the pass that shows it again", () => {
  const scene = new THREE.Scene();
  skipCulledMatrices(scene);
  const culled = marker(scene, 4);
  const hidden = marker(scene, 8);
  scene.updateMatrixWorld();
  culled.group.visible = false;
  setCulled(culled.group, true);
  hidden.group.visible = false;
  culled.group.position.x = 40;
  hidden.group.position.x = 80;
  scene.updateMatrixWorld();
  expect(culled.mesh.matrixWorld.elements.slice(12, 15)).toEqual([4, 2, 0]);
  expect(hidden.mesh.matrixWorld.elements.slice(12, 15)).toEqual([80, 2, 0]);
  culled.group.visible = true;
  setCulled(culled.group, false);
  scene.updateMatrixWorld();
  expect(culled.mesh.matrixWorld.elements.slice(12, 15)).toEqual([40, 2, 0]);
});

test("a culled marker's world position is still exact when asked for directly", () => {
  const scene = new THREE.Scene();
  skipCulledMatrices(scene);
  const { group, mesh } = marker(scene, 4);
  group.visible = false;
  setCulled(group, true);
  group.position.x = 12;
  scene.updateMatrixWorld();
  expect(mesh.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([12, 2, 0]);
});

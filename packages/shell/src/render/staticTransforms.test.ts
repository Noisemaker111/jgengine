import { expect, test } from "bun:test";
import * as THREE from "three";

import { freezeStaticTransforms, thawStaticTransforms } from "./staticTransforms";

function frozenScene(): { scene: THREE.Scene; mesh: THREE.Object3D } {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.position.set(4, 0, 0);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.position.set(2, 1, 0);
  group.add(mesh);
  scene.add(group);
  return { scene, mesh };
}

test("a frozen subtree bakes its world matrix once and then ignores a moved pose", () => {
  const { scene, mesh } = frozenScene();
  freezeStaticTransforms(scene);
  expect(mesh.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([6, 1, 0]);

  mesh.position.set(9, 9, 9);
  scene.updateMatrixWorld();
  expect(mesh.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([6, 1, 0]);
});

test("a thawed subtree follows its pose again", () => {
  const { scene, mesh } = frozenScene();
  freezeStaticTransforms(scene);
  thawStaticTransforms(scene);

  mesh.position.set(3, 1, 0);
  scene.updateMatrixWorld();
  expect(mesh.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([7, 1, 0]);
});

test("freezing leaves the scene root updating, so later content still mounts correctly", () => {
  const { scene } = frozenScene();
  const batch = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
  scene.add(batch);
  freezeStaticTransforms(batch);
  expect(scene.matrixWorldAutoUpdate).toBe(true);
  expect(scene.matrixAutoUpdate).toBe(true);

  const late = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  late.position.set(0, 5, 0);
  scene.add(late);
  scene.updateMatrixWorld();
  expect(late.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([0, 5, 0]);
});

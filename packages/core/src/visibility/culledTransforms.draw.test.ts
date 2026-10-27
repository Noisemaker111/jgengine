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

test("a skinned character that walks off stays inside its body: its skin follows where the mesh hangs now", () => {
  const scene = new THREE.Scene();
  skipCulledMatrices(scene);
  const group = new THREE.Group();
  const bone = new THREE.Bone();
  group.add(bone);
  // One vertex a metre up, fully on the one bone, the mesh scaled inside the model like an exported rig.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 1, 0], 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.scale.setScalar(2);
  group.add(mesh);
  scene.add(group);
  scene.updateMatrixWorld();
  mesh.bind(new THREE.Skeleton([bone]));
  const skinnedAt = () => mesh.localToWorld(mesh.getVertexPosition(0, new THREE.Vector3())).toArray().map((v) => Math.round(v * 1000) / 1000);
  expect(skinnedAt()).toEqual([0, 2, 0]);

  group.position.set(30, 0, -12);
  group.rotation.y = Math.PI / 2;
  scene.updateMatrixWorld();
  expect(skinnedAt()).toEqual([30, 2, -12]);
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

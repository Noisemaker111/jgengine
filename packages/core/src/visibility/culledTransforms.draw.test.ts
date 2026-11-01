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

test("a still node is not recomposed each frame; one that moves is, and its children follow", () => {
  const scene = new THREE.Scene();
  skipCulledMatrices(scene);
  const still = marker(scene, 4);
  const moving = marker(scene, 8);
  scene.updateMatrixWorld();
  let recomposed = 0;
  const count = (node: THREE.Object3D) => {
    const original = node.updateMatrix.bind(node);
    node.updateMatrix = () => {
      recomposed += 1;
      original();
    };
  };
  for (const node of [still.group, still.mesh, moving.group, moving.mesh]) count(node);
  moving.group.position.x = 9;
  scene.updateMatrixWorld();
  expect(recomposed).toBe(1);
  expect(moving.mesh.matrixWorld.elements.slice(12, 15)).toEqual([9, 2, 0]);
  expect(still.mesh.matrixWorld.elements.slice(12, 15)).toEqual([4, 2, 0]);
});

test("a node moved under a new parent with the same local transform takes the new parent's place", () => {
  const scene = new THREE.Scene();
  skipCulledMatrices(scene);
  const a = marker(scene, 4);
  const b = marker(scene, 20);
  scene.updateMatrixWorld();
  b.group.add(a.mesh);
  scene.updateMatrixWorld();
  expect(a.mesh.matrixWorld.elements.slice(12, 15)).toEqual([20, 2, 0]);
});

test("a culled node shown again under a parent that moved while it was out of view is rebuilt", () => {
  const scene = new THREE.Scene();
  skipCulledMatrices(scene);
  const { group, mesh } = marker(scene, 4);
  scene.updateMatrixWorld();
  mesh.visible = false;
  setCulled(mesh, true);
  group.position.x = 30;
  scene.updateMatrixWorld();
  mesh.visible = true;
  setCulled(mesh, false);
  scene.updateMatrixWorld();
  expect(mesh.matrixWorld.elements.slice(12, 15)).toEqual([30, 2, 0]);
});

test("asking one node for its world position does not rebuild the rest of the scene", () => {
  const scene = new THREE.Scene();
  skipCulledMatrices(scene);
  const asked = marker(scene, 4);
  const other = marker(scene, 8);
  scene.updateMatrixWorld();
  // Up to r185 three's getWorldPosition marked every ancestor up to the scene as needing a world update; from
  // r187 it does not. Either way the next pass must not rebuild the untouched subtree.
  asked.mesh.getWorldPosition(new THREE.Vector3());
  let rebuilt = 0;
  const multiply = other.mesh.matrixWorld.multiplyMatrices.bind(other.mesh.matrixWorld);
  other.mesh.matrixWorld.multiplyMatrices = (a, b) => {
    rebuilt += 1;
    return multiply(a, b);
  };
  scene.updateMatrixWorld();
  expect(rebuilt).toBe(0);
  other.group.position.x = 9;
  scene.updateMatrixWorld();
  expect(rebuilt).toBe(1);
  expect(other.mesh.matrixWorld.elements.slice(12, 15)).toEqual([9, 2, 0]);
});

test("a world matrix something else wrote (a pose held for one render) is put back by the next pass", () => {
  const scene = new THREE.Scene();
  skipCulledMatrices(scene);
  const { group, mesh } = marker(scene, 4);
  scene.updateMatrixWorld();
  // Move, rebuild the subtree with three's own pass, move back: the node's local transform is where the
  // last pass left it, but its child's world matrix is not.
  group.position.x = 50;
  group.updateMatrixWorld(true);
  group.position.x = 4;
  group.updateMatrix();
  group.matrixWorld.makeTranslation(4, 0, 0);
  scene.updateMatrixWorld();
  expect(mesh.matrixWorld.elements.slice(12, 15)).toEqual([4, 2, 0]);
});

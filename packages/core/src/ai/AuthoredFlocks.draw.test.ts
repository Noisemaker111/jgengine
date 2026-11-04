import { expect, test } from "bun:test";
import * as THREE from "three";

import { applyFlockPose, flockSpeciesInstances, writeFlockInstances } from "./AuthoredFlocks.draw";

test("habitat models follow actual agent positions and climbing velocity", () => {
  const group = new THREE.Group();
  const forward = new THREE.Vector3(0, 0, -1);
  applyFlockPose(group, { position: [2, 8, 4], velocity: [0, 3, -4] }, forward, new THREE.Vector3());
  const nose = forward.clone().applyQuaternion(group.quaternion);
  expect(group.position.toArray()).toEqual([2, 8, 4]);
  expect(nose.y).toBeCloseTo(0.6);
  expect(nose.z).toBeCloseTo(-0.8);
});

test("an instanced flock draws exactly its agents, each where its rig would stand, after the source offset", () => {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 4);
  const source = { localMatrix: new THREE.Matrix4().makeTranslation(0, 0.5, 0) };
  const forward = new THREE.Vector3(0, 0, -1);
  const scratch = { pose: new THREE.Object3D(), direction: new THREE.Vector3(), matrix: new THREE.Matrix4() };
  const agents = [
    { position: [2, 8, 4] as const, velocity: [0, 3, -4] as const },
    { position: [-6, 10, 0] as const, velocity: [1, 0, 0] as const },
  ];
  writeFlockInstances(mesh, source, agents, forward, scratch);
  expect(mesh.count).toBe(2);
  const rig = new THREE.Group();
  for (const [index, agent] of agents.entries()) {
    applyFlockPose(rig, agent, forward, new THREE.Vector3());
    rig.updateMatrix();
    const expected = rig.matrix.clone().multiply(source.localMatrix);
    const drawn = new THREE.Matrix4();
    mesh.getMatrixAt(index, drawn);
    drawn.elements.forEach((value, i) => expect(value).toBeCloseTo(expected.elements[i]!));
  }
  expect(mesh.boundingSphere?.containsPoint(new THREE.Vector3(-6, 10.5, 0))).toBe(true);

  writeFlockInstances(mesh, source, agents.slice(0, 1), forward, scratch);
  expect(mesh.count).toBe(1);
  writeFlockInstances(mesh, source, [...agents, ...agents, ...agents], forward, scratch);
  expect(mesh.count).toBe(4);
});

test("only a still, plain species model draws its flock as instances", () => {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  const gull = { url: "gull.glb" };
  expect(flockSpeciesInstances(gull, { scene, animations: [] })).toBe(true);
  expect(flockSpeciesInstances(gull, { scene, animations: [new THREE.AnimationClip("flap", 1, [])] })).toBe(false);
  expect(flockSpeciesInstances({ ...gull, attachments: [{ bone: "head", model: { url: "hat.glb" } }] }, { scene, animations: [] })).toBe(false);
  expect(flockSpeciesInstances({ ...gull, hiddenNodes: ["wing"] }, { scene, animations: [] })).toBe(false);
});

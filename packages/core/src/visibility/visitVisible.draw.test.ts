import { expect, test } from "bun:test";
import * as THREE from "three";

import { visitVisible } from "./visitVisible.draw";

test("visits what three's traverseVisible visits, in the same order", () => {
  const scene = new THREE.Scene();
  const a = new THREE.Group();
  a.name = "a";
  const a1 = new THREE.Object3D();
  a1.name = "a1";
  const a2 = new THREE.Object3D();
  a2.name = "a2";
  const hidden = new THREE.Group();
  hidden.name = "hidden";
  hidden.visible = false;
  const underHidden = new THREE.Object3D();
  underHidden.name = "underHidden";
  const b = new THREE.Object3D();
  b.name = "b";
  a.add(a1, a2);
  hidden.add(underHidden);
  scene.add(a, hidden, b);

  const three: string[] = [];
  scene.traverseVisible((node) => three.push(node.name || node.type));
  const ours: string[] = [];
  visitVisible(scene, (node) => ours.push(node.name || node.type));
  expect(ours).toEqual(three);
  expect(ours).toEqual(["Scene", "a", "a1", "a2", "b"]);

  scene.visible = false;
  const none: string[] = [];
  visitVisible(scene, (node) => none.push(node.name));
  expect(none).toEqual([]);
});

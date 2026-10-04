import { expect, test } from "bun:test";
import * as THREE from "three";
import { cloneModelScene, disposeModelScene } from "./modelRender";
import { applyModelNodeVisibility, modelHiddenNodesKey } from "./modelNodeVisibility";

test("visibility resolves native aliases on the clone without removing animated descendants", () => {
  const source = new THREE.Group();
  const slot = new THREE.Bone(); slot.name = "handslotr"; slot.userData.name = "handslot.r";
  const accessory = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); accessory.name = "Accessory";
  slot.add(accessory); source.add(slot);
  const clone = cloneModelScene(source);
  try {
    expect(applyModelNodeVisibility(clone, ["handslot.r"])).toEqual([]);
    expect(clone.getObjectByName("handslotr")!.visible).toBe(false);
    expect(clone.getObjectByName("Accessory")!.parent).toBe(clone.getObjectByName("handslotr"));
    expect(source.getObjectByName("handslotr")!.visible).toBe(true);
    const mixer = new THREE.AnimationMixer(clone);
    mixer.clipAction(new THREE.AnimationClip("move", 1, [new THREE.VectorKeyframeTrack("handslotr.position", [0, 1], [0, 0, 0, 1, 2, 3])])).play();
    mixer.update(0.5);
    expect(clone.getObjectByName("handslotr")!.position.toArray()).toEqual([0.5, 1, 1.5]);
    expect(slot.position.toArray()).toEqual([0, 0, 0]);
    mixer.stopAllAction(); mixer.uncacheRoot(clone);
  } finally { disposeModelScene(clone); }
});

test("missing and ambiguous names leave the body and imported visibility intact", () => {
  const root = new THREE.Group();
  const a = new THREE.Object3D(), b = new THREE.Object3D(), hidden = new THREE.Object3D();
  a.name = "native-a"; b.name = "native-b"; a.userData.name = b.userData.name = "duplicate";
  hidden.name = "hidden"; hidden.visible = false; root.add(a, b, hidden);
  expect(applyModelNodeVisibility(root, ["missing", "duplicate"]).map(item => item.code)).toEqual(["missing-node", "ambiguous-node"]);
  expect([root.visible, a.visible, b.visible, hidden.visible]).toEqual([true, true, true, false]);
  a.name = b.name = "same-runtime";
  expect(applyModelNodeVisibility(root, ["same-runtime"])[0]!.code).toBe("ambiguous-node");
  expect([a.visible, b.visible]).toEqual([true, true]);
  expect(applyModelNodeVisibility(root)).toEqual([]);
  expect(hidden.visible).toBe(false);
  expect(() => applyModelNodeVisibility(root, ["native-a", " "])).toThrow("nonblank");
  expect(a.visible).toBe(true);
});

test("equivalent lists share a content key without rewriting caller data", () => {
  const names = Object.freeze(["b", "a", "b"]);
  expect(modelHiddenNodesKey(names)).toBe(modelHiddenNodesKey(["a", "b"]));
  expect(modelHiddenNodesKey()).toBe(modelHiddenNodesKey([]));
  expect(modelHiddenNodesKey(["a"])).not.toBe(modelHiddenNodesKey(["b"]));
  expect(names).toEqual(["b", "a", "b"]);
});

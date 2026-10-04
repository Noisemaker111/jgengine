import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { resolveRigNode } from "./rigNode";

async function character(name: string) {
  const bytes = readFileSync(new URL(`../../../../apps/dev/public/models/kaykit-adventurers/${name}.glb`, import.meta.url));
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
}

describe("imported rig node references", () => {
  for (const name of ["Knight", "Rogue_Hooded"]) test(`${name}'s authored hand slot resolves on the imported instance`, async () => {
    const gltf = await character(name);
    const first = clone(gltf.scene), second = clone(gltf.scene);
    const placement = new THREE.Group();
    placement.position.set(8, 2, -6);
    placement.rotation.set(0.1, Math.PI / 3, -0.15);
    placement.scale.setScalar(1.7);
    placement.add(first);
    expect(first.getObjectByName("handslot.r")).toBeUndefined();
    const resolved = resolveRigNode(first, "handslot.r");
    expect(resolved.matchedBy).toBe("authored");
    expect(resolved.node?.name).toBe("handslotr");
    expect(resolved.node?.userData.name).toBe("handslot.r");
    expect(resolved.diagnostic).toBeUndefined();
    expect(resolveRigNode(first, "handslotr").node).toBe(resolved.node);
    expect(resolveRigNode(second, "handslot.r").node).not.toBe(resolved.node);
    expect(resolveRigNode(gltf.scene, "handslot.r").node).not.toBe(resolved.node);
    const attachment = new THREE.Object3D();
    attachment.name = "test-attachment";
    attachment.position.set(0.08, -0.03, 0.12);
    attachment.rotation.set(0.2, 0.4, -0.1);
    attachment.scale.setScalar(0.65);
    resolved.node!.add(attachment);
    placement.updateWorldMatrix(true, true);
    const before = attachment.getWorldPosition(new THREE.Vector3());
    const secondBind = resolveRigNode(second, "handslot.r").node!.getWorldPosition(new THREE.Vector3());
    const mixer = new THREE.AnimationMixer(first);
    mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, "Walking_A")!).play();
    mixer.update(0.2);
    placement.updateWorldMatrix(true, true);
    const world = attachment.getWorldPosition(new THREE.Vector3());
    expect(world.distanceTo(before)).toBeGreaterThan(0.001);
    const expected = new THREE.Vector3(0.08, -0.03, 0.12).applyMatrix4(resolved.node!.matrixWorld);
    expect(world.distanceTo(expected)).toBeLessThan(1e-6);
    expect(world.distanceTo(resolved.node!.getWorldPosition(new THREE.Vector3()))).toBeGreaterThan(0.001);
    expect(world.toArray().every(Number.isFinite)).toBe(true);
    expect(attachment.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    expect(attachment.position.toArray()).toEqual([0.08, -0.03, 0.12]);
    expect(attachment.scale.toArray()).toEqual([0.65, 0.65, 0.65]);
    expect(resolveRigNode(second, "handslot.r").node!.getWorldPosition(new THREE.Vector3()).distanceTo(secondBind)).toBeLessThan(1e-6);
    expect(resolveRigNode(second, "handslot.r").node!.children).not.toContain(attachment);
    resolved.node!.remove(attachment);
    expect(attachment.parent).toBeNull();
    expect(resolved.node!.children).not.toContain(attachment);
    mixer.stopAllAction(); mixer.uncacheRoot(first);
  });

  test("an exact runtime name takes precedence over original-name aliases and accepts Object3D slots", () => {
    const rig = new THREE.Group(), exact = new THREE.Object3D(), alias = new THREE.Bone();
    exact.name = "hand.r"; alias.name = "handr"; alias.userData.name = "hand.r";
    rig.add(alias, exact);
    expect(resolveRigNode(rig, "hand.r")).toEqual({ node: exact, matchedBy: "runtime" });
  });

  test("duplicate original or runtime names report repair diagnostics instead of picking a node", () => {
    const rig = new THREE.Group(), a = new THREE.Bone(), b = new THREE.Bone();
    a.name = "handr"; b.name = "handr_1";
    a.userData.name = b.userData.name = "hand.r";
    rig.add(a, b);
    expect(resolveRigNode(rig, "hand.r").diagnostic?.code).toBe("ambiguous-node");
    expect(resolveRigNode(rig, "hand.r").diagnostic?.message).toContain("2 authored names");
    expect(resolveRigNode(rig, "hand.r").node).toBeUndefined();
    b.name = "handr";
    expect(resolveRigNode(rig, "handr").diagnostic?.message).toContain("2 runtime names");
    expect(resolveRigNode(rig, "unknown").diagnostic?.code).toBe("missing-node");
    expect(resolveRigNode(rig, "unknown").node).toBeUndefined();
  });
});

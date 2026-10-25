import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { applyGlance, createGlanceState, DEFAULT_GLANCE, findGlanceRig } from "./characterGlance";

/** Hips at 1, a neck at 1.5 and a head at 1.65 whose local axes point along -X, unlike the body. */
function rig(names: { neck?: string; head?: string } = {}) {
  const scene = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = "Hips";
  hips.position.y = 1;
  const neck = new THREE.Bone();
  neck.name = names.neck ?? "Neck";
  neck.position.y = 0.5;
  neck.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  const head = new THREE.Bone();
  head.name = names.head ?? "Head";
  head.position.y = 0.15;
  const end = new THREE.Bone();
  end.name = "HeadTop_End";
  end.position.y = 0.2;
  scene.add(hips);
  hips.add(neck);
  neck.add(head);
  head.add(end);
  scene.updateMatrixWorld(true);
  return { scene, head, neck };
}

/** Where the head's rest-pose forward (+Z of the body, whatever the bone axes) points in world space. */
function gaze(head: THREE.Object3D, rest: THREE.Quaternion): THREE.Vector3 {
  const world = head.getWorldQuaternion(new THREE.Quaternion());
  const turn = world.multiply(rest.clone().invert());
  return new THREE.Vector3(0, 0, 1).applyQuaternion(turn);
}

function run(frames: number, step: () => void) {
  for (let i = 0; i < frames; i += 1) step();
}

describe("findGlanceRig", () => {
  test("finds head and neck across rig naming schemes and skips end markers", () => {
    for (const [neck, head] of [["Neck", "Head"], ["mixamorigNeck", "mixamorigHead"], ["Bip01 Neck", "Bip01 Head"], ["neck", "head"]] as const) {
      const found = findGlanceRig(rig({ neck, head }).scene);
      expect(found?.head.name).toBe(head);
      expect(found?.neck?.name).toBe(neck);
    }
  });

  test("a rig with no head bone gets no glance", () => {
    const scene = new THREE.Group();
    const bone = new THREE.Bone();
    bone.name = "Spine";
    scene.add(bone);
    expect(findGlanceRig(scene)).toBeNull();
  });
});

describe("applyGlance", () => {
  test("a player to the character's right turns the head toward them, whatever the bone axes", () => {
    const { scene, head } = rig();
    const restHead = head.getWorldQuaternion(new THREE.Quaternion());
    const glance = findGlanceRig(scene)!;
    const state = createGlanceState();
    const target = new THREE.Vector3(3, 1.65, 3);
    run(120, () => applyGlance(glance, 0, target, state, 1 / 60));
    const looking = gaze(head, restHead);
    expect(Math.atan2(looking.x, looking.z)).toBeCloseTo(Math.PI / 4, 1);
    expect(Math.abs(looking.y)).toBeLessThan(0.05);
  });

  test("the turn stops at the yaw limit and ignores a player behind the character", () => {
    const side = rig();
    const restSide = side.head.getWorldQuaternion(new THREE.Quaternion());
    const sideGlance = findGlanceRig(side.scene)!;
    const sideState = createGlanceState();
    run(120, () => applyGlance(sideGlance, 0, new THREE.Vector3(4, 1.65, 0.5), sideState, 1 / 60));
    const looking = gaze(side.head, restSide);
    expect(Math.atan2(looking.x, looking.z)).toBeCloseTo(DEFAULT_GLANCE.maxYaw, 1);

    const back = rig();
    const restBack = back.head.quaternion.clone();
    const backGlance = findGlanceRig(back.scene)!;
    const backState = createGlanceState();
    run(60, () => applyGlance(backGlance, 0, new THREE.Vector3(0.2, 1.65, -3), backState, 1 / 60));
    expect(backState.weight).toBe(0);
    expect(back.head.quaternion.angleTo(restBack)).toBeLessThan(1e-6);
  });

  test("the heading is the character's own yaw", () => {
    const { scene, head } = rig();
    scene.rotation.y = Math.PI / 2;
    scene.updateMatrixWorld(true);
    const rest = head.getWorldQuaternion(new THREE.Quaternion());
    const glance = findGlanceRig(scene)!;
    const state = createGlanceState();
    run(120, () => applyGlance(glance, Math.PI / 2, new THREE.Vector3(3, 1.65, 0), state, 1 / 60));
    expect(state.engaged).toBe(true);
    expect(gaze(head, rest).angleTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(0.05);
    run(120, () => applyGlance(glance, Math.PI / 2, new THREE.Vector3(3, 1.65, 3), state, 1 / 60));
    const looking = gaze(head, rest);
    expect(Math.atan2(looking.x, looking.z)).toBeCloseTo(-Math.PI / 4, 1);
  });

  test("walking out of reach fades the turn back to the animated pose without drift", () => {
    const { scene, head, neck } = rig();
    const restHead = head.quaternion.clone();
    const restNeck = neck.quaternion.clone();
    const glance = findGlanceRig(scene)!;
    const state = createGlanceState();
    run(90, () => applyGlance(glance, 0, new THREE.Vector3(2, 2.2, 3), state, 1 / 60));
    expect(head.quaternion.angleTo(restHead)).toBeGreaterThan(0.1);
    run(90, () => applyGlance(glance, 0, new THREE.Vector3(2, 1.65, 30), state, 1 / 60));
    expect(state.weight).toBe(0);
    expect(head.quaternion.angleTo(restHead)).toBeLessThan(1e-6);
    expect(neck.quaternion.angleTo(restNeck)).toBeLessThan(1e-6);
  });

  test("a player at the edge of reach does not flicker the turn on and off", () => {
    const { scene } = rig();
    const glance = findGlanceRig(scene)!;
    const state = createGlanceState();
    run(30, () => applyGlance(glance, 0, new THREE.Vector3(0, 1.65, 6), state, 1 / 60));
    expect(state.engaged).toBe(true);
    run(30, () => applyGlance(glance, 0, new THREE.Vector3(0, 1.65, (DEFAULT_GLANCE.reach + DEFAULT_GLANCE.release) / 2), state, 1 / 60));
    expect(state.engaged).toBe(true);
  });
});

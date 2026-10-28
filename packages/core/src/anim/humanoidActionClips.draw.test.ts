import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { collapseHead, humanoidHead } from "@jgengine/core/camera/firstPersonBody.draw";
import { addHumanoidSockets, buildHumanoidActionClips, firstPersonArms, withHumanoidActionClips } from "./humanoidActionClips.draw";
import { HUMANOID_ACTION_NAMES } from "./humanoidActions";

/**
 * A Biped-named rig built the way an FBX import arrives: authored Z-up in centimetres under a
 * converting root, with bones whose local axes are turned arbitrarily. Standing, it is about
 * 1.75 m tall, faces +Z, arms hanging at its sides.
 */
function bipedRig(): THREE.Group {
  const scene = new THREE.Group();
  const avatar = new THREE.Group();
  avatar.name = "Avatar";
  avatar.rotation.x = -Math.PI / 2;
  avatar.scale.setScalar(0.01);
  scene.add(avatar);
  const twist = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -0.9, 1.3));
  // Each bone's rotation in the authoring frame, so a child's offset lands where it is written.
  const frames = new Map<THREE.Object3D, THREE.Quaternion>([[avatar, new THREE.Quaternion()]]);
  const bone = (name: string, parent: THREE.Object3D, at: readonly [number, number, number], turned = false): THREE.Bone => {
    const node = new THREE.Bone();
    node.name = name;
    const parentFrame = frames.get(parent) ?? new THREE.Quaternion();
    node.position.set(...at).applyQuaternion(parentFrame.clone().invert());
    if (turned) node.quaternion.copy(twist);
    frames.set(node, parentFrame.clone().multiply(node.quaternion));
    parent.add(node);
    return node;
  };
  // Positions are in the Z-up authoring frame: +Z up, -Y forward, +X the character's left.
  const root = bone("Bip01", avatar, [0, 0, 0]);
  const pelvis = bone("Bip01_Pelvis", root, [0, 0, 100], true);
  const spine = bone("Bip01_Spine", pelvis, [0, 0, 10]);
  const spine1 = bone("Bip01_Spine1", spine, [0, 0, 15], true);
  const spine2 = bone("Bip01_Spine2", spine1, [0, 0, 15]);
  const neck = bone("Bip01_Neck", spine2, [0, 0, 20]);
  bone("Bip01_Head", neck, [0, 0, 10], true);
  for (const [side, x] of [["L", 1], ["R", -1]] as const) {
    const upper = bone(`Bip01_${side}_UpperArm`, spine2, [x * 20, 0, 15], true);
    const fore = bone(`Bip01_${side}_Forearm`, upper, [0, 0, -30]);
    bone(`Bip01_${side}_Hand`, fore, [0, 0, -25], true);
    const thigh = bone(`Bip01_${side}_Thigh`, pelvis, [x * 10, 0, 0], true);
    const calf = bone(`Bip01_${side}_Calf`, thigh, [0, 0, -45]);
    const foot = bone(`Bip01_${side}_Foot`, calf, [0, 0, -45], true);
    bone(`Bip01_${side}_Toe0`, foot, [0, -12, -8]);
  }
  scene.updateMatrixWorld(true);
  return scene;
}

function worldOf(scene: THREE.Object3D, name: string): THREE.Vector3 {
  scene.updateMatrixWorld(true);
  const node = scene.getObjectByName(name);
  if (node === undefined) throw new Error(`no ${name}`);
  return node.getWorldPosition(new THREE.Vector3());
}

function posed(scene: THREE.Object3D, clip: THREE.AnimationClip, time: number): THREE.AnimationMixer {
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.setTime(time);
  return mixer;
}

function clipNamed(clips: readonly THREE.AnimationClip[], name: string): THREE.AnimationClip {
  const clip = clips.find((candidate) => candidate.name === name);
  if (clip === undefined) throw new Error(`no ${name} clip`);
  return clip;
}

describe("authored humanoid clips on a rig with its own axes and units", () => {
  test("a full humanoid rig gets every authored action; a partial one gets none", () => {
    expect(buildHumanoidActionClips(bipedRig(), []).map((clip) => clip.name)).toEqual([...HUMANOID_ACTION_NAMES]);
    const partial = new THREE.Group();
    const lone = new THREE.Bone();
    lone.name = "Bip01_Pelvis";
    partial.add(lone);
    expect(buildHumanoidActionClips(partial, [])).toEqual([]);
  });

  test("a rig's own clip of the same name wins over the authored one", () => {
    const own = new THREE.AnimationClip("Jump", 1, []);
    const clips = buildHumanoidActionClips(bipedRig(), [own]);
    expect(clips.map((clip) => clip.name)).not.toContain("Jump");
  });

  test("the punch drives the right fist forward to shoulder height, whatever the bone axes", () => {
    const scene = bipedRig();
    const rest = worldOf(scene, "Bip01_R_Hand");
    posed(scene, clipNamed(buildHumanoidActionClips(scene, []), "Punch"), 0.26);
    const hit = worldOf(scene, "Bip01_R_Hand");
    expect(hit.z - rest.z).toBeGreaterThan(0.4);
    expect(hit.y).toBeGreaterThan(1.25);
    expect(worldOf(scene, "Bip01_L_Hand").y).toBeGreaterThan(rest.y + 0.3);
  });

  test("the overhead swing lifts the tool hand above the head before it strikes", () => {
    const scene = bipedRig();
    const swing = clipNamed(buildHumanoidActionClips(scene, []), "Swing");
    posed(scene, swing, 0.32);
    expect(worldOf(scene, "Bip01_R_Hand").y).toBeGreaterThan(worldOf(scene, "Bip01_Head").y);
  });

  test("death lays the body on its back on the ground", () => {
    const scene = bipedRig();
    posed(scene, clipNamed(buildHumanoidActionClips(scene, []), "Death"), 1.5);
    const pelvis = worldOf(scene, "Bip01_Pelvis");
    const head = worldOf(scene, "Bip01_Head");
    expect(pelvis.y).toBeLessThan(0.25);
    expect(Math.abs(head.y - pelvis.y)).toBeLessThan(0.25);
    expect(head.z).toBeLessThan(pelvis.z - 0.4);
  });

  test("swimming lies the body prone, head leading, at the surface", () => {
    const scene = bipedRig();
    posed(scene, clipNamed(buildHumanoidActionClips(scene, []), "Swim"), 0);
    const pelvis = worldOf(scene, "Bip01_Pelvis");
    const neck = worldOf(scene, "Bip01_Neck");
    expect(neck.z - pelvis.z).toBeGreaterThan(0.4);
    expect(Math.abs(neck.y - pelvis.y)).toBeLessThan(0.2);
    expect(Math.abs(pelvis.y)).toBeLessThan(0.25);
  });

  test("bones the idle clip animates but no action turns hold the idle pose", () => {
    const scene = bipedRig();
    const idle = new THREE.AnimationClip("Idle", 2, [new THREE.VectorKeyframeTrack("Bip01.position", [0, 2], [0, 0, 3, 0, 0, 3])]);
    const punch = clipNamed(buildHumanoidActionClips(scene, [idle]), "Punch");
    const root = punch.tracks.find((track) => track.name === "Bip01.position");
    expect(Array.from(root?.values ?? [])).toEqual([0, 0, 3, 0, 0, 3]);
  });

  test("clips are built once per loaded model and shared by its instances", () => {
    const scene = bipedRig();
    const source: THREE.AnimationClip[] = [];
    expect(withHumanoidActionClips(scene, source)).toBe(withHumanoidActionClips(scene, source));
  });
});

describe("humanoid hand sockets", () => {
  test("a hand socket sits at the wrist in the character's own frame and metres", () => {
    const source = bipedRig();
    const instance = source.clone(true);
    addHumanoidSockets(instance, source, []);
    instance.updateMatrixWorld(true);
    const socket = instance.getObjectByName("hand.r");
    if (socket === undefined) throw new Error("no hand.r socket");
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    socket.matrixWorld.decompose(position, rotation, scale);
    expect(position.distanceTo(worldOf(instance, "Bip01_R_Hand"))).toBeLessThan(1e-6);
    expect(rotation.angleTo(new THREE.Quaternion())).toBeLessThan(1e-5);
    expect(scale.x).toBeCloseTo(1, 5);
    expect(scale.y).toBeCloseTo(1, 5);
  });

  test("a rig the standard cannot map gets no sockets, and a second pass adds none", () => {
    const loose = new THREE.Group();
    addHumanoidSockets(loose, loose, []);
    expect(loose.getObjectByName("hand.r")).toBeUndefined();
    const source = bipedRig();
    const instance = source.clone(true);
    addHumanoidSockets(instance, source, []);
    addHumanoidSockets(instance, source, []);
    let count = 0;
    instance.traverse((node) => { if (node.name === "hand.r") count++; });
    expect(count).toBe(1);
  });
});

describe("first-person body", () => {
  test("the carry raises both hands in front of the chest, and only once per animated frame", () => {
    const source = bipedRig();
    const instance = source.clone(true);
    const rest = worldOf(instance, "Bip01_R_Hand");
    const carry = firstPersonArms(instance, source, []);
    if (carry === null) throw new Error("a mapped humanoid gets a carry");
    carry();
    const raised = worldOf(instance, "Bip01_R_Hand");
    expect(raised.z - rest.z).toBeGreaterThan(0.3);
    expect(raised.y - rest.y).toBeGreaterThan(0.4);
    carry();
    expect(worldOf(instance, "Bip01_R_Hand").distanceTo(raised)).toBeLessThan(1e-6);
  });

  test("the carry lets go while an action swings the arms", () => {
    const source = bipedRig();
    const instance = source.clone(true);
    const mixer = posed(instance, clipNamed(buildHumanoidActionClips(source, []), "Swing"), 0.32);
    const swung = worldOf(instance, "Bip01_R_Hand");
    const carry = firstPersonArms(instance, source, []);
    mixer.setTime(0.32);
    carry?.();
    expect(worldOf(instance, "Bip01_R_Hand").distanceTo(swung)).toBeLessThan(1e-3);
  });

  test("the head folds into the neck; a rig the standard cannot map has none to fold", () => {
    const scene = bipedRig();
    const head = humanoidHead(scene);
    if (head === null) throw new Error("no head");
    collapseHead(head);
    expect(head.scale.x).toBeLessThan(0.01);
    expect(humanoidHead(new THREE.Group())).toBeNull();
    expect(firstPersonArms(new THREE.Group(), new THREE.Group(), [])).toBeNull();
  });
});

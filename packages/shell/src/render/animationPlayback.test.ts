import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createAnimGraphRuntime, type AnimGraph } from "@jgengine/core/anim/animGraph";
import { locomotionGraph } from "@jgengine/core/anim/locomotionGraph";
import { animGraphFromConfig } from "@jgengine/core/anim/locomotionGraph";
import { defaultAnimationForClips } from "@jgengine/core/game/clipRoles";
import { createGraphPose, diagnoseModelAnimation, takeRootMotion } from "./useModelAnimation";

async function knight() {
  const bytes = readFileSync(new URL("../../../../apps/dev/public/models/kaykit-adventurers/Knight.glb", import.meta.url));
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
}

function poseValues(scene: THREE.Object3D): number[] {
  const values: number[] = [];
  scene.traverse((node) => { if ((node as THREE.Bone).isBone === true) values.push(...node.position.toArray(), ...node.quaternion.toArray()); });
  return values;
}

describe("independent graph playback on an imported KayKit rig", () => {
  test("a real imported dodge extracts travel while the pose stays in place and keeps vertical motion", async () => {
    const gltf = await knight();
    const scene = cloneSkinned(gltf.scene);
    const parent = new THREE.Group();
    parent.position.set(4, 2, -3);
    parent.scale.setScalar(1.7);
    parent.rotation.y = Math.PI / 2;
    parent.add(scene);
    let root: THREE.Bone | undefined;
    scene.traverse((node) => { if (root === undefined && (node as THREE.Bone).isBone === true) root = node as THREE.Bone; });
    const bind = root!.position.clone();
    const graph: AnimGraph = { layers: [{ id: "base", entry: "dodge", states: { dodge: { kind: "clip", clip: "Dodge_Left", loop: false, rootMotion: true } }, transitions: [] }] };
    expect(diagnoseModelAnimation(scene, { graph }, gltf.animations)).toEqual([]);
    const pose = createGraphPose(scene, graph, gltf.animations);
    expect(pose.durations.Dodge_Left!.rootTrack).toBeDefined();
    const runtime = createAnimGraphRuntime(graph);
    const out = runtime.advance(pose.durations.Dodge_Left!.duration * 0.4, {}, pose.durations);
    expect(Math.hypot(out.rootDelta![0], out.rootDelta![2])).toBeGreaterThan(0.01);
    pose.apply(out.clips);
    const vertical = root!.position.y;
    expect(Math.hypot(root!.position.x - bind.x, root!.position.z - bind.z)).toBeGreaterThan(0.01);
    pose.apply(out.clips, out.rootMotion);
    expect(root!.position.x).toBe(bind.x);
    expect(root!.position.z).toBe(bind.z);
    expect(root!.position.y).toBeCloseTo(vertical, 6);
    root!.parent!.updateWorldMatrix(true, false);
    const expected = new THREE.Vector3().fromArray(out.rootDelta!).applyMatrix3(new THREE.Matrix3().setFromMatrix4(root!.parent!.matrixWorld));
    expected.y = 0;
    expect(takeRootMotion(root!, bind, out.rootDelta, new THREE.Vector3()).distanceTo(expected)).toBeLessThan(1e-6);
    expect(parent.position.toArray()).toEqual([4, 2, -3]);
    expect(parent.scale.toArray()).toEqual([1.7, 1.7, 1.7]);
    pose.dispose();
  });

  test("a real walk-to-attack fade matches two continuously advancing imported clips", async () => {
    const gltf = await knight();
    const scene = cloneSkinned(gltf.scene);
    const reference = cloneSkinned(gltf.scene);
    const graph: AnimGraph = { layers: [{ id: "base", entry: "walk", states: {
      walk: { kind: "clip", clip: "Walking_A" }, attack: { kind: "clip", clip: "1H_Melee_Attack_Chop", loop: false },
    }, transitions: [{ from: "walk", to: "attack", trigger: "attack", duration: 0.2 }] }] };
    const pose = createGraphPose(scene, graph, gltf.animations);
    const runtime = createAnimGraphRuntime(graph);
    runtime.advance(0.25, {}, pose.durations);
    runtime.trigger("attack");
    runtime.advance(0, {}, pose.durations);
    const output = runtime.advance(0.1, {}, pose.durations);
    pose.apply(output.clips);
    const mixer = new THREE.AnimationMixer(reference);
    for (const [name, time] of [["Walking_A", 0.35], ["1H_Melee_Attack_Chop", 0.1]] as const) {
      const action = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, name)!);
      action.play();
      action.weight = 0.5;
      action.time = time;
    }
    mixer.update(0);
    const expected = poseValues(reference);
    const actual = poseValues(scene);
    expect(Math.max(...actual.map((value, index) => Math.abs(value - expected[index]!)))).toBeLessThan(1e-6);
    pose.dispose();
    mixer.stopAllAction();
    mixer.uncacheRoot(reference);
  });

  test("an interrupted imported root-motion fade stays in place across restoration until its last influence ends", async () => {
    const gltf = await knight();
    const scene = cloneSkinned(gltf.scene);
    let root: THREE.Bone | undefined;
    scene.traverse((node) => { if (root === undefined && (node as THREE.Bone).isBone === true) root = node as THREE.Bone; });
    const bind = root!.position.clone();
    const graph: AnimGraph = { layers: [{ id: "base", entry: "dodge", states: {
      dodge: { kind: "clip", clip: "Dodge_Left", loop: false, rootMotion: true },
      idle: { kind: "clip", clip: "Idle" }, walk: { kind: "clip", clip: "Walking_A" },
    }, transitions: [
      { from: "dodge", to: "idle", trigger: "stop", duration: 0.2 },
      { from: "idle", to: "walk", trigger: "walk", duration: 0.2 },
    ] }] };
    const pose = createGraphPose(scene, graph, gltf.animations);
    const runtime = createAnimGraphRuntime(graph);
    runtime.advance(0.25, {}, pose.durations);
    runtime.trigger("stop"); runtime.advance(0, {}, pose.durations);
    const firstFade = runtime.advance(0.05, {}, pose.durations);
    expect(firstFade.clips.find((clip) => clip.clip === "Dodge_Left")!.weight).toBeCloseTo(0.75);
    // Without the in-place flag the same weighted imported source moves the root 0.33m sideways.
    pose.apply(firstFade.clips);
    expect(Math.abs(root!.position.x - bind.x)).toBeGreaterThan(0.3);
    expect(firstFade.rootMotion).toBe(true);
    pose.apply(firstFade.clips, firstFade.rootMotion);
    expect(root!.position.x).toBe(bind.x);
    expect(root!.position.z).toBe(bind.z);
    runtime.trigger("walk"); runtime.advance(0, {}, pose.durations);
    const restored = createAnimGraphRuntime(graph);
    restored.restore(JSON.parse(JSON.stringify(runtime.snapshot())));
    const interrupted = runtime.advance(0.03, {}, pose.durations);
    expect(restored.advance(0.03, {}, pose.durations)).toEqual(interrupted);
    expect(interrupted.rootMotion).toBe(true);
    pose.apply(interrupted.clips, interrupted.rootMotion);
    expect(root!.position.x).toBe(bind.x);
    expect(root!.position.z).toBe(bind.z);
    const finished = runtime.advance(0.3, {}, pose.durations);
    expect(finished.clips.some((clip) => clip.clip === "Dodge_Left")).toBe(false);
    expect(finished.rootMotion).toBeUndefined();
    pose.dispose();
  });

  test("same-clip states retain an outgoing root policy when their fade is interrupted", async () => {
    const gltf = await knight();
    const scene = cloneSkinned(gltf.scene);
    const graph: AnimGraph = { layers: [{ id: "base", entry: "travel", states: {
      travel: { kind: "clip", clip: "Dodge_Left", loop: false, rootMotion: true },
      pose: { kind: "clip", clip: "Dodge_Left", loop: false }, idle: { kind: "clip", clip: "Idle" },
    }, transitions: [
      { from: "travel", to: "pose", trigger: "pose", duration: 0.2 },
      { from: "pose", to: "idle", trigger: "stop", duration: 0.2 },
    ] }] };
    const pose = createGraphPose(scene, graph, gltf.animations);
    const runtime = createAnimGraphRuntime(graph);
    runtime.advance(0.25, {}, pose.durations);
    runtime.trigger("pose"); runtime.advance(0, {}, pose.durations);
    expect(runtime.advance(0.05, {}, pose.durations).rootMotion).toBe(true);
    runtime.trigger("stop"); runtime.advance(0, {}, pose.durations);
    expect(runtime.advance(0.05, {}, pose.durations).rootMotion).toBe(true);
    expect(runtime.advance(0.2, {}, pose.durations).rootMotion).toBeUndefined();
    // Once the root-policy source has fully faded away, a later transition must not revive it.
    const completed = createAnimGraphRuntime(graph);
    completed.trigger("pose"); completed.advance(0, {}, pose.durations);
    expect(completed.advance(0.2, {}, pose.durations).rootMotion).toBeUndefined();
    completed.trigger("stop"); completed.advance(0, {}, pose.durations);
    expect(completed.advance(0.05, {}, pose.durations).rootMotion).toBeUndefined();
    pose.dispose();
  });

  test("auto animation preserves and plays the imported rig's alternate attack variant", async () => {
    const gltf = await knight();
    const animation = defaultAnimationForClips(gltf.animations.map((clip) => clip.name))!;
    const attacks = animation.oneShots!.attack as readonly string[];
    expect(attacks.length).toBeGreaterThan(1);
    expect(diagnoseModelAnimation(gltf.scene, animation, gltf.animations)).toEqual([]);
    const graph = animGraphFromConfig(animation)!;
    const scene = cloneSkinned(gltf.scene);
    const pose = createGraphPose(scene, graph, gltf.animations);
    const runtime = createAnimGraphRuntime(graph, { rng: () => 0.999 });
    runtime.trigger("attack");
    runtime.advance(0, {}, pose.durations);
    const output = runtime.advance(0.2, {}, pose.durations);
    expect(output.clips).toEqual([{ layer: "base", clip: attacks.at(-1)!, weight: 1, time: 0.2 }]);
    pose.apply(output.clips);
    const reference = cloneSkinned(gltf.scene);
    const mixer = new THREE.AnimationMixer(reference);
    const action = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, attacks.at(-1)!)!);
    action.play();
    action.time = 0.2;
    mixer.update(0);
    const expected = poseValues(reference);
    const actual = poseValues(scene);
    expect(Math.max(...actual.map((value, index) => Math.abs(value - expected[index]!)))).toBeLessThan(1e-6);
    pose.dispose();
    mixer.stopAllAction();
    mixer.uncacheRoot(reference);
  });

  test("diagnostics name missing clips and masks and unsupported root-bone assumptions", async () => {
    const gltf = await knight();
    const graph: AnimGraph = { layers: [{ id: "upper", entry: "attack", states: { attack: { kind: "clip", clip: "Idle", variants: ["Idle", "Typo"], rootMotion: true } }, transitions: [], mask: ["WrongSpine"] }] };
    const wrapper = new THREE.Group();
    const unrelated = new THREE.Bone();
    unrelated.name = "UnsupportedRoot";
    wrapper.add(unrelated, gltf.scene);
    const diagnostics = diagnoseModelAnimation(wrapper, { graph }, gltf.animations);
    expect(diagnostics.map((entry) => entry.code)).toEqual(["missing-clip", "empty-layer-mask", "missing-root-track"]);
    expect(diagnostics[0]!.message).toContain('"Typo"');
    expect(diagnostics[0]!.message).toContain("retains the bind pose");
    expect(diagnostics[1]!.message).toContain('"upper"');
    expect(diagnostics[2]!.message).toContain('first bone "UnsupportedRoot"');
  });

  test("partial roles diagnose the active playback mode and dormant mappings cannot invalidate an authored graph", async () => {
    const gltf = await knight();
    const partial = { clip: "Idle", states: { run: "Running_A" } } as unknown as Parameters<typeof diagnoseModelAnimation>[1];
    const pending = diagnoseModelAnimation(gltf.scene, partial, gltf.animations);
    expect(pending.map((entry) => entry.code)).toEqual(["incomplete-locomotion"]);
    expect(pending[0]!.message).toContain('single clip "Idle" remains active');
    const noClip = diagnoseModelAnimation(gltf.scene, { states: partial.states }, gltf.animations);
    expect(noClip[0]!.message).toContain("bind pose is retained");
    const noWalk = diagnoseModelAnimation(gltf.scene, { states: { idle: "Idle", walk: "" } }, gltf.animations);
    expect(noWalk.map((entry) => entry.code)).toEqual(["incomplete-locomotion"]);
    expect(noWalk[0]!.message).toContain('idle "Idle" is held');
    const graph = locomotionGraph({ idle: "Idle", walk: "Walking_A" });
    expect(diagnoseModelAnimation(gltf.scene, { graph, clip: "DormantTypo", states: { idle: "", walk: "DormantTypo" }, oneShots: { attack: "DormantTypo" } }, gltf.animations)).toEqual([]);
    expect(diagnoseModelAnimation(gltf.scene, { states: { idle: "Idle", walk: "Walking_A" }, clip: "DormantTypo" }, gltf.animations)).toEqual([]);
  });

  test("a real root-motion clip masked away from its root reports the incompatible layer", async () => {
    const gltf = await knight();
    const source = THREE.AnimationClip.findByName(gltf.animations, "Dodge_Left")!;
    const rootTrack = source.tracks.find((track) => track.name === "root.position")!;
    expect(rootTrack).toBeDefined();
    const otherTrack = source.tracks.find((track) => !track.name.startsWith("root."))!;
    const graph: AnimGraph = { layers: [{ id: "upper", entry: "dodge", states: { dodge: { kind: "clip", clip: "Dodge_Left", rootMotion: true } }, transitions: [], mask: [otherTrack.name] }] };
    expect(diagnoseModelAnimation(gltf.scene, { graph }, gltf.animations).map((diagnostic) => diagnostic.code)).toEqual(["missing-root-track"]);
  });

  test("two unmasked layers playing the same clip retain their own time and weight", async () => {
    const gltf = await knight();
    const scene = cloneSkinned(gltf.scene);
    const reference = cloneSkinned(gltf.scene);
    const graph: AnimGraph = { layers: [
      { id: "base", entry: "idle", states: { idle: { kind: "clip", clip: "Idle" } }, transitions: [], weight: 0.4 },
      { id: "overlay", entry: "idle", states: { idle: { kind: "clip", clip: "Idle", speed: 2 } }, transitions: [], weight: 0.6 },
    ] };
    const pose = createGraphPose(scene, graph, gltf.animations);
    pose.apply([{ clip: "Idle", layer: "base", weight: 0.4, time: 0.2 }, { clip: "Idle", layer: "overlay", weight: 0.6, time: 0.8 }]);
    const mixer = new THREE.AnimationMixer(reference);
    const source = THREE.AnimationClip.findByName(gltf.animations, "Idle")!;
    for (const [weight, time] of [[0.4, 0.2], [0.6, 0.8]]) {
      const action = mixer.clipAction(source.clone());
      action.play();
      action.weight = weight!;
      action.time = time!;
    }
    mixer.update(0);
    const actual = poseValues(scene);
    const expected = poseValues(reference);
    const differences = actual.map((value, index) => Math.abs(value - expected[index]!));
    expect(Math.max(...differences)).toBeLessThan(1e-6);
    pose.dispose();
    mixer.stopAllAction();
    mixer.uncacheRoot(reference);
  });

  test("two cloned instances animate and clean up independently without changing imported bind transforms", async () => {
    const gltf = await knight();
    const bind = poseValues(gltf.scene);
    const a = cloneSkinned(gltf.scene);
    const b = cloneSkinned(gltf.scene);
    const graph = locomotionGraph({ idle: "Idle", walk: "Walking_A", run: "Running_A" });
    const first = createGraphPose(a, graph, gltf.animations);
    const second = createGraphPose(b, graph, gltf.animations);
    const runtime = createAnimGraphRuntime(graph);
    first.apply(runtime.advance(0.25, { speed: 0.5 }, first.durations).clips);
    const aWalking = poseValues(a);
    expect(aWalking).not.toEqual(poseValues(b));
    expect(poseValues(gltf.scene)).toEqual(bind);
    first.dispose();
    expect(poseValues(a)).toEqual(bind);
    second.apply([{ layer: "base", clip: "Running_A", weight: 1, time: 0.4 }]);
    expect(poseValues(b)).not.toEqual(bind);
    expect(poseValues(a)).toEqual(bind);
    expect(poseValues(gltf.scene)).toEqual(bind);
    second.dispose();
  });
});

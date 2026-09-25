import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import { createAnimGraphRuntime } from "@jgengine/core/anim/animGraph";
import { locomotionGraph } from "@jgengine/core/anim/locomotionGraph";
import { createGraphPose } from "./useModelAnimation";

async function loadKnight(): Promise<GLTF> {
  const file = fileURLToPath(new URL("../../../../apps/dev/public/models/kaykit-adventurers/Knight.glb", import.meta.url));
  const bytes = readFileSync(file);
  const warn = console.warn;
  const error = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

function boneQuaternions(scene: THREE.Object3D): number[] {
  const values: number[] = [];
  scene.traverse((object) => {
    if ((object as THREE.Bone).isBone === true) values.push(...object.quaternion.toArray());
  });
  return values;
}

describe("createGraphPose on a KayKit Knight", () => {
  test("posing from graph output matches the clip played directly on a mixer", async () => {
    const gltf = await loadKnight();
    const graph = locomotionGraph({ idle: "Idle", walk: "Walking_A", run: "Running_A", oneShots: { attack: "1H_Melee_Attack_Chop" } });
    const pose = createGraphPose(gltf.scene, graph, gltf.animations);
    expect(pose.durations.Walking_A!.duration).toBeGreaterThan(0);

    const runtime = createAnimGraphRuntime(graph);
    const out = runtime.advance(0.4, { speed: 0.5 }, pose.durations);
    expect(out.clips.filter((clip) => clip.weight > 0).map((clip) => clip.clip)).toEqual(["Walking_A"]);
    pose.apply(out.clips);
    const posed = boneQuaternions(gltf.scene);
    pose.dispose();

    const reference = await loadKnight();
    const mixer = new THREE.AnimationMixer(reference.scene);
    const action = mixer.clipAction(THREE.AnimationClip.findByName(reference.animations, "Walking_A")!);
    action.play();
    action.time = 0.4;
    mixer.update(0);
    const expected = boneQuaternions(reference.scene);
    expect(posed).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i += 1) expect(posed[i]!).toBeCloseTo(expected[i]!, 5);
  });

  test("a triggered one-shot poses the rig with that clip at the runtime's time", async () => {
    const gltf = await loadKnight();
    const graph = locomotionGraph({ idle: "Idle", walk: "Walking_A", oneShots: { attack: "1H_Melee_Attack_Chop" } });
    const pose = createGraphPose(gltf.scene, graph, gltf.animations);
    const runtime = createAnimGraphRuntime(graph);
    runtime.advance(0.3, { speed: 0 }, pose.durations);
    runtime.trigger("attack");
    runtime.advance(0.2, { speed: 0 }, pose.durations);
    const out = runtime.advance(0.2, { speed: 0 }, pose.durations);
    expect(runtime.stateOf("base")).toBe("attack");
    const attack = out.clips.find((clip) => clip.clip === "1H_Melee_Attack_Chop" && clip.weight === 1)!;
    pose.apply(out.clips);
    const posed = boneQuaternions(gltf.scene);
    pose.dispose();

    const reference = await loadKnight();
    const mixer = new THREE.AnimationMixer(reference.scene);
    const action = mixer.clipAction(THREE.AnimationClip.findByName(reference.animations, "1H_Melee_Attack_Chop")!);
    action.play();
    action.time = attack.time;
    mixer.update(0);
    const expected = boneQuaternions(reference.scene);
    for (let i = 0; i < expected.length; i += 1) expect(posed[i]!).toBeCloseTo(expected[i]!, 5);
  });
});

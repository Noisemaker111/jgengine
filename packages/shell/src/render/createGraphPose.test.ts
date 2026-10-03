import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import { createAnimGraphRuntime } from "@jgengine/core/anim/animGraph";
import { locomotionGraph } from "@jgengine/core/anim/locomotionGraph";
import { createGraphPose } from "./useModelAnimation";
import { cloneModelScene, disposeModelScene, modelPlacementTransform } from "./modelRender";
import { measureLocalBounds } from "./measureBounds";
import { measureLocalCollisionTriangles } from "./measureCollisionMesh";
import { modelBindPosePositions } from "./modelBindPose";

async function loadModel(path: string): Promise<GLTF> {
  const file = fileURLToPath(new URL(`../../../../apps/dev/public/models/${path}`, import.meta.url));
  const bytes = readFileSync(file);
  const warn = console.warn;
  const error = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

const loadKnight = () => loadModel("kaykit-adventurers/Knight.glb");

describe("model normalization on an imported skinned creature", () => {
  test("grounds actual skin-applied vertices and keeps collider geometry in that same bind pose", async () => {
    const gltf = await loadModel("claudecraft/creatures/wild_boar.glb");
    const instance = cloneModelScene(gltf.scene);
    const second = cloneModelScene(gltf.scene);
    const root = new THREE.Group().add(instance);
    const transform = modelPlacementTransform(root, { url: "boar", targetHeight: 1.45, y: 0.2 });
    root.position.fromArray(transform.position);
    root.scale.setScalar(transform.scale);
    root.updateMatrixWorld(true);
    const rendered = new THREE.Box3().setFromObject(root, true);
    expect(rendered.max.y - rendered.min.y).toBeCloseTo(1.45, 6);
    expect(rendered.min.y).toBeCloseTo(0.2, 6);
    expect((rendered.min.x + rendered.max.x) / 2).toBeCloseTo(0, 6);
    expect((rendered.min.z + rendered.max.z) / 2).toBeCloseTo(0, 6);

    const meshesOf = (scene: THREE.Object3D) => {
      const meshes: THREE.SkinnedMesh[] = [];
      scene.traverse((node) => { if ((node as THREE.SkinnedMesh).isSkinnedMesh === true) meshes.push(node as THREE.SkinnedMesh); });
      return meshes;
    };
    const mesh = meshesOf(instance)[0]!;
    expect(modelBindPosePositions(mesh)).toBe(modelBindPosePositions(meshesOf(second)[0]!));
    const triangles = measureLocalCollisionTriangles(root, { scale: transform.scale, offset: transform.position })!;
    const expected = new THREE.Vector3();
    for (let index = 0; index < mesh.geometry.getAttribute("position").count; index++) {
      mesh.getVertexPosition(index, expected).applyMatrix4(mesh.matrixWorld);
      expect(expected.distanceTo(new THREE.Vector3().fromArray(triangles.positions, index * 3))).toBeLessThan(1e-6);
    }
    const before = measureLocalBounds(root);
    const mixer = new THREE.AnimationMixer(instance);
    const dying = THREE.AnimationClip.findByName(gltf.animations, "Dying")!;
    mixer.clipAction(dying).play();
    mixer.update(dying.duration * 0.9);
    const animated = new THREE.Box3().setFromObject(root, true);
    expect(animated.min.distanceTo(rendered.min)).toBeGreaterThan(0.1);
    expect(measureLocalBounds(root)).toEqual(before);
    expect(measureLocalCollisionTriangles(root, { scale: transform.scale, offset: transform.position })!.positions).toEqual(triangles.positions);
    mixer.stopAllAction();
    mixer.uncacheRoot(instance);
    disposeModelScene(instance);
    disposeModelScene(second);
  });
});

function boneQuaternions(scene: THREE.Object3D): number[] {
  const values: number[] = [];
  scene.traverse((object) => {
    if ((object as THREE.Bone).isBone === true) values.push(...object.quaternion.toArray());
  });
  return values;
}

describe("createGraphPose on a KayKit Knight", () => {
  test("a model instance preserves the original rig's animated vertex positions with shared skeletons", async () => {
    const gltf = await loadKnight();
    const reference = cloneSkinned(gltf.scene);
    const instance = cloneModelScene(gltf.scene);
    const meshesOf = (root: THREE.Object3D): THREE.SkinnedMesh[] => {
      const meshes: THREE.SkinnedMesh[] = [];
      root.traverse((node) => { if ((node as THREE.SkinnedMesh).isSkinnedMesh === true) meshes.push(node as THREE.SkinnedMesh); });
      return meshes;
    };
    const originalMeshes = meshesOf(reference);
    const meshes = meshesOf(instance);
    expect(new Set(meshes.map((mesh) => mesh.skeleton)).size).toBeLessThan(new Set(originalMeshes.map((mesh) => mesh.skeleton)).size);
    const expected = new THREE.Vector3();
    const actual = new THREE.Vector3();
    for (const name of ["Idle", "Walking_A", "Running_A", "Cheer"]) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, name)!;
      const mixers = [new THREE.AnimationMixer(reference), new THREE.AnimationMixer(instance)];
      for (const mixer of mixers) mixer.clipAction(clip).play();
      for (const time of [0, 0.4, clip.duration * 0.8]) {
        for (const mixer of mixers) mixer.setTime(time);
        reference.updateMatrixWorld(true);
        instance.updateMatrixWorld(true);
        for (let index = 0; index < meshes.length; index++) {
          const mesh = meshes[index]!;
          const original = originalMeshes[index]!;
          const positions = mesh.geometry.getAttribute("position");
          for (const vertex of [0, Math.floor(positions.count / 2), positions.count - 1]) {
            original.applyBoneTransform(vertex, expected.fromBufferAttribute(positions, vertex));
            mesh.applyBoneTransform(vertex, actual.fromBufferAttribute(positions, vertex));
            expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
          }
        }
      }
      for (const mixer of mixers) { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); }
    }
    disposeModelScene(instance);
  });

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

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import { sampleBoneTexture } from "@jgengine/core/anim/boneTexture";
import { bakeSkinnedCrowd, createCrowdUniforms, patchCrowdMaterial, type BakedSkinnedCrowd } from "./SkinnedInstances";

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

function boneMatrix(baked: BakedSkinnedCrowd, slot: number, row: number): THREE.Matrix4 {
  const data = baked.texture.image.data as Float32Array;
  const offset = (row * baked.layout.width + slot * 4) * 4;
  return new THREE.Matrix4().fromArray(data, offset);
}

/** CPU mirror of the crowd shader: blend the baked bone matrices and skin one vertex. */
function skinBaked(baked: BakedSkinnedCrowd, vertex: number, clip: string, time: number): THREE.Vector3 {
  const index = baked.clipIndex.get(clip)!;
  const sample = sampleBoneTexture(baked.layout.clips[index]!, baked.layout.fps, time, baked.loops[index]!);
  const position = new THREE.Vector3().fromBufferAttribute(baked.geometry.getAttribute("position") as THREE.BufferAttribute, vertex);
  const skinIndex = baked.geometry.getAttribute("skinIndex");
  const skinWeight = baked.geometry.getAttribute("skinWeight");
  const out = new THREE.Vector3();
  for (let c = 0; c < 4; c += 1) {
    const weight = skinWeight.getComponent(vertex, c);
    if (weight === 0) continue;
    const slot = skinIndex.getComponent(vertex, c);
    const a = position.clone().applyMatrix4(boneMatrix(baked, slot, sample.rowA));
    const b = position.clone().applyMatrix4(boneMatrix(baked, slot, sample.rowB));
    out.addScaledVector(a.lerp(b, sample.t), weight);
  }
  return out;
}

/** three's own CPU skinning of the same vertex, posed by a mixer at `time`. */
function skinReference(gltf: GLTF, clip: string, time: number): THREE.Vector3[] {
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, clip)!);
  action.play();
  action.time = time;
  mixer.update(0);
  gltf.scene.updateMatrixWorld(true);
  const positions: THREE.Vector3[] = [];
  gltf.scene.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh !== true) return;
    mesh.skeleton.update();
    const count = mesh.geometry.getAttribute("position").count;
    for (let v = 0; v < count; v += 1) positions.push(mesh.getVertexPosition(v, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
  });
  action.stop();
  mixer.uncacheRoot(gltf.scene);
  return positions;
}

describe("bakeSkinnedCrowd on a KayKit Knight", () => {
  test("merges every skinned mesh and lays out the requested clips", async () => {
    const gltf = await loadKnight();
    const baked = bakeSkinnedCrowd(gltf, { clips: ["Idle", "Walking_A", "Death_A"], once: ["Death_A"], fps: 20 });
    let vertices = 0;
    gltf.scene.traverse((object) => {
      if ((object as THREE.SkinnedMesh).isSkinnedMesh === true) vertices += (object as THREE.SkinnedMesh).geometry.getAttribute("position").count;
    });
    expect(baked.geometry.getAttribute("position").count).toBe(vertices);
    expect(baked.materials).toHaveLength(baked.geometry.groups.length);
    expect(baked.layout.clips.map((clip) => clip.name)).toEqual(["Idle", "Walking_A", "Death_A"]);
    expect(baked.loops).toEqual([true, true, false]);
    expect(baked.texture.image.width).toBe(baked.layout.width);
    expect(baked.texture.image.height).toBe(baked.layout.height);
  });

  test.each([
    { clip: "Walking_A", time: 0.4, tolerance: 1e-4 },
    { clip: "Idle", time: 1.05, tolerance: 1e-4 },
    { clip: "Walking_A", time: 0.4125, tolerance: 0.02 },
  ])("baked skinning matches three's CPU skinning for $clip at $time s", async ({ clip, time, tolerance }) => {
    const gltf = await loadKnight();
    const baked = bakeSkinnedCrowd(gltf, { clips: ["Idle", "Walking_A"], fps: 20 });
    const reference = skinReference(gltf, clip, time);
    expect(reference).toHaveLength(baked.geometry.getAttribute("position").count);
    let worst = 0;
    for (let v = 0; v < reference.length; v += 7) worst = Math.max(worst, skinBaked(baked, v, clip, time).distanceTo(reference[v]!));
    expect(worst).toBeLessThan(tolerance);
  });

  test("rejects an unknown clip name", async () => {
    const gltf = await loadKnight();
    expect(() => bakeSkinnedCrowd(gltf, { clips: ["Moonwalk"] })).toThrow(/Moonwalk/);
  });
});

describe("patchCrowdMaterial", () => {
  test("injects the crowd lookup into position and normal and shares the uniforms", async () => {
    const gltf = await loadKnight();
    const baked = bakeSkinnedCrowd(gltf, { clips: ["Idle", "Walking_A"], fps: 10 });
    const uniforms = createCrowdUniforms(baked);
    expect(uniforms.crowdClips.value.map((clip) => clip.toArray())).toEqual([
      [0, baked.layout.clips[0]!.frameCount, 10, 1],
      [baked.layout.clips[1]!.startFrame, baked.layout.clips[1]!.frameCount, 10, 1],
    ]);
    const material = patchCrowdMaterial(new THREE.MeshStandardMaterial(), uniforms);
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.crowdTime).toBe(uniforms.crowdTime);
    expect(shader.vertexShader).toContain("#define CROWD_CLIP_COUNT 2");
    expect(shader.vertexShader).toContain("objectNormal = mat3(crowdSkin()) * objectNormal;");
    expect(shader.vertexShader).toContain("transformed = (crowdSkin() * vec4(transformed, 1.0)).xyz;");
    const depth = patchCrowdMaterial(new THREE.MeshDepthMaterial(), uniforms);
    const depthShader = { uniforms: {}, vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: "" };
    depth.onBeforeCompile(depthShader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(depthShader.vertexShader).toContain("crowdSkin() * vec4(transformed, 1.0)");
  });
});

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
  const layout = baked.layout!;
  const data = (baked.texture!.image.data as Float32Array);
  const offset = (row * layout.width + slot * 4) * 4;
  return new THREE.Matrix4().fromArray(data, offset);
}

/** CPU mirror of the crowd shader: blend the baked slot matrices and skin one vertex. */
function skinBaked(baked: BakedSkinnedCrowd, vertex: number, clip: string, time: number): THREE.Vector3 {
  const index = baked.clipIndex.get(clip)!;
  const sample = sampleBoneTexture(baked.layout!.clips[index]!, baked.layout!.fps, time, baked.loops[index]!);
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

/** A model's meshes grouped exactly the way the bake groups them: material, then vertex layout. */
function bakeGroups(scene: THREE.Object3D): THREE.Mesh[][] {
  const groups = new Map<string, THREE.Mesh[]>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true || Array.isArray(mesh.material) || mesh.material === undefined) return;
    if (mesh.geometry.getAttribute("position") === undefined) return;
    const material = mesh.material as THREE.Material;
    const layout = [mesh.geometry.index === null ? "plain" : "indexed", ...Object.keys(mesh.geometry.attributes).sort()].join(",");
    const key = `${material.uuid}|${layout}`;
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [mesh]);
    else bucket.push(mesh);
  });
  return [...groups.values()];
}

/**
 * three's own CPU skinning of the same vertices in the bake's draw order: grouped by material, meshes
 * in traversal order, skinned vertices posed by the mixer and rigid vertices by their node.
 */
function skinReference(gltf: GLTF, clip: string, time: number): THREE.Vector3[] {
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, clip)!);
  action.play();
  action.time = time;
  mixer.update(0);
  gltf.scene.updateMatrixWorld(true);
  const positions: THREE.Vector3[] = [];
  for (const meshes of bakeGroups(gltf.scene)) {
    for (const mesh of meshes) {
      const index = mesh.geometry.index;
      const count = index === null ? mesh.geometry.getAttribute("position").count : index.count;
      const skinned = mesh as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh === true) {
        skinned.skeleton.update();
        for (let i = 0; i < count; i += 1) {
          const v = index === null ? i : index.getX(i);
          positions.push(skinned.getVertexPosition(v, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
        }
        continue;
      }
      const attribute = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < count; i += 1) {
        const v = index === null ? i : index.getX(i);
        positions.push(new THREE.Vector3().fromBufferAttribute(attribute, v).applyMatrix4(mesh.matrixWorld));
      }
    }
  }
  action.stop();
  mixer.uncacheRoot(gltf.scene);
  return positions;
}

describe("bakeSkinnedCrowd on a KayKit Knight", () => {
  test("merges every mesh, armour parts included, and lays out the requested clips", async () => {
    const gltf = await loadKnight();
    const baked = bakeSkinnedCrowd(gltf, { clips: ["Idle", "Walking_A", "Death_A"], once: ["Death_A"], fps: 20 });
    let vertices = 0;
    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh !== true) return;
      // The bake flattens indexed parts, so an indexed mesh contributes one vertex per index.
      vertices += mesh.geometry.index === null ? mesh.geometry.getAttribute("position").count : mesh.geometry.index.count;
    });
    expect(baked.geometry.getAttribute("position").count).toBe(vertices);
    // One geometry group per material when several materials are merged; a single-material rig
    // needs no groups and is still one draw.
    expect(baked.geometry.groups.length).toBe(baked.materials.length === 1 ? 0 : baked.materials.length);
    expect(baked.layout!.clips.map((clip) => clip.name)).toEqual(["Idle", "Walking_A", "Death_A"]);
    expect(baked.loops).toEqual([true, true, false]);
    expect(baked.texture!.image.width).toBe(baked.layout!.width);
    expect(baked.texture!.image.height).toBe(baked.layout!.height);
    expect(baked.animated).toBe(true);
  });

  test("one draw per material, however many meshes that material covers", async () => {
    const gltf = await loadKnight();
    const materials = new Set<string>();
    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh !== true || Array.isArray(mesh.material)) return;
      materials.add((mesh.material as THREE.Material).uuid);
    });
    const baked = bakeSkinnedCrowd(gltf, { clips: ["Idle"], fps: 10 });
    // A material split across meshes with different vertex layouts would still need its own draw.
    expect(baked.materials.length).toBeLessThanOrEqual(materials.size);
    expect(baked.materials.length).toBe(1);
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

/** A node-transform character: two rotating arms and a static body, like a miniature army. */
function rigidCharacter(material: THREE.Material): { scene: THREE.Group; animations: THREE.AnimationClip[] } {
  const scene = new THREE.Group();
  const root = new THREE.Group();
  root.name = "unit";
  scene.add(root);
  const arm = new THREE.Group();
  arm.name = "ArmL";
  arm.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 0.2), material));
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.4), material);
  body.position.y = 1;
  root.add(arm, body);
  const clip = new THREE.AnimationClip("Idle", 1, [
    new THREE.QuaternionKeyframeTrack("ArmL.quaternion", [0, 1], [0, 0, 0, 1, 0, 0.3826834, 0, 0.9238795]),
  ]);
  return { scene, animations: [clip] };
}

describe("bakeSkinnedCrowd on a rig-less character", () => {
  test("merges a node-transform character into one draw and bakes the moving node", () => {
    const material = new THREE.MeshStandardMaterial();
    const source = rigidCharacter(material);
    const baked = bakeSkinnedCrowd(source, { clips: ["Idle"], fps: 10 });
    expect(baked.animated).toBe(true);
    expect(baked.materials).toEqual([material]);
    expect(baked.geometry.groups.length).toBe(0);
    expect(baked.layout!.clips[0]!.name).toBe("Idle");
    // Both meshes ride one geometry, so a batch draws the whole character per material.
    const meshes: THREE.Mesh[] = [];
    source.scene.traverse((object) => {
      if ((object as THREE.Mesh).isMesh === true) meshes.push(object as THREE.Mesh);
    });
    let vertices = 0;
    for (const mesh of meshes) {
      const geometry = mesh.geometry;
      vertices += geometry.index === null ? geometry.getAttribute("position").count : geometry.index.count;
    }
    expect(baked.geometry.getAttribute("position").count).toBe(vertices);
    // The arm rotates away from the body between the first and last baked frames.
    const arm = new THREE.Vector3().fromBufferAttribute(baked.geometry.getAttribute("position") as THREE.BufferAttribute, 0);
    const start = arm.clone().applyMatrix4(boneMatrix(baked, baked.geometry.getAttribute("skinIndex").getX(0), 0));
    const end = arm.clone().applyMatrix4(boneMatrix(baked, baked.geometry.getAttribute("skinIndex").getX(0), 10));
    expect(start.distanceTo(end)).toBeGreaterThan(0.01);
  });

  test("a character with no clips bakes to a static batch with no texture", () => {
    const material = new THREE.MeshStandardMaterial();
    const source = rigidCharacter(material);
    const baked = bakeSkinnedCrowd({ scene: source.scene, animations: [] }, {});
    expect(baked.animated).toBe(false);
    expect(baked.texture).toBeNull();
    expect(baked.layout).toBeNull();
    expect(baked.materials).toEqual([material]);
    expect(baked.geometry.groups.length).toBe(0);
    expect(() => createCrowdUniforms(baked)).toThrow(/static/);
  });

  test("a rig with two materials is two draws for the batch", () => {
    const scene = new THREE.Group();
    const first = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const second = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    second.position.x = 2;
    scene.add(first, second);
    const baked = bakeSkinnedCrowd({ scene, animations: [] }, {});
    expect(baked.materials).toHaveLength(2);
    expect(baked.geometry.groups).toHaveLength(2);
  });
  test("rejects a rig that animates a node with non-uniform scale", () => {
    const scene = new THREE.Group();
    const node = new THREE.Group();
    node.name = "ArmL";
    node.scale.set(1, 2, 1);
    node.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    scene.add(node);
    const clip = new THREE.AnimationClip("Idle", 1, [new THREE.QuaternionKeyframeTrack("ArmL.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]);
    expect(() => bakeSkinnedCrowd({ scene, animations: [clip] }, { clips: ["Idle"] })).toThrow(/non-uniform scale/);
  });
});

describe("patchCrowdMaterial", () => {
  test("injects the crowd lookup into position and normal and shares the uniforms", async () => {
    const gltf = await loadKnight();
    const baked = bakeSkinnedCrowd(gltf, { clips: ["Idle", "Walking_A"], fps: 10 });
    const uniforms = createCrowdUniforms(baked);
    expect(uniforms.crowdClips.value.map((clip) => clip.toArray())).toEqual([
      [0, baked.layout!.clips[0]!.frameCount, 10, 1],
      [baked.layout!.clips[1]!.startFrame, baked.layout!.clips[1]!.frameCount, 10, 1],
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

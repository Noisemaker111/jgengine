import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, createRoot, type ReconcilerRoot } from "@react-three/fiber";
import { createElement, Suspense } from "react";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { GameProvider } from "@jgengine/react/provider";

import { sharedGltfLoader } from "./modelLoad";
import { modelBindPosePositions } from "./modelBindPose";
import { standardMaterialsOf } from "./modelRender";
import type { MeasuredLocalBounds } from "./measureBounds";
import type { MeasuredCollisionTriangles } from "./measureCollisionMesh";
import { EntityModel } from "./SceneModels";
import { useModelInstance, type ModelInstance, type ModelInstanceConfig, type ModelInstanceOptions } from "./useModelInstance";

const roots: ReconcilerRoot<HTMLCanvasElement>[] = [];
const originalLoad = sharedGltfLoader.load;
let nextUrl = 0;
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
beforeEach(() => { actEnvironment.IS_REACT_ACT_ENVIRONMENT = true; });

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  sharedGltfLoader.load = originalLoad;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

async function harness(source: THREE.Group, animations: THREE.AnimationClip[] = []) {
  const url = `/model-instance-fixture-${nextUrl++}.glb`;
  sharedGltfLoader.load = (_url, onLoad) => onLoad({ scene: source, animations } as GLTF);
  const root = createRoot({} as HTMLCanvasElement);
  roots.push(root);
  await root.configure({
    frameloop: "never", size: { width: 100, height: 100, top: 0, left: 0 }, dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as THREE.WebGLRenderer,
  });
  const instances: ModelInstance[] = [];
  function Model({ index, model, options }: { index: number; model: ModelInstanceConfig; options?: ModelInstanceOptions }) {
    const instance = useModelInstance(model, options);
    instances[index] = instance;
    return createElement("primitive", { object: instance.scene, position: instance.position, scale: instance.scale });
  }
  async function render(models: { model: ModelInstanceConfig; options?: ModelInstanceOptions }[]) {
    await act(async () => {
      root.render(createElement(Suspense, { fallback: null }, models.map((props, index) =>
        createElement(Model, { ...props, key: index, index }))));
    });
  }
  return { url, root, instances, render };
}

function sourceModel() {
  const source = new THREE.Group();
  source.position.set(7, 5, -4);
  source.scale.set(2, 3, 4);
  source.rotation.y = Math.PI / 4;
  const material = new THREE.MeshStandardMaterial({ color: "#abcdef" });
  const geometry = new THREE.BoxGeometry(2, 3, 4);
  source.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  return { source, material, geometry };
}

describe("useModelInstance", () => {
  test("owns isolated materials, preserves imported transforms and applies caller placement and shadows", async () => {
    const { source, material, geometry } = sourceModel();
    const h = await harness(source);
    await h.render([
      { model: { url: h.url, targetHeight: 1.8, scale: 1.5, y: 0.3, shadows: "receive" },
        options: { configure: content => standardMaterialsOf(content)[0]!.color.set("#ff0000") } },
      { model: { url: h.url, anchor: "origin" } },
    ]);
    const first = h.instances[0]!;
    const second = h.instances[1]!;
    expect(first.content.position.toArray()).toEqual([7, 5, -4]);
    expect(first.content.scale.toArray()).toEqual([2, 3, 4]);
    expect(first.content.parent).toBe(first.scene);
    first.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(first.scene);
    expect(bounds.min.y).toBeCloseTo(0.3, 6);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(2.7, 6);
    expect((bounds.min.x + bounds.max.x) / 2).toBeCloseTo(0, 6);
    expect((bounds.min.z + bounds.max.z) / 2).toBeCloseTo(0, 6);
    const mesh = first.content.children[0] as THREE.Mesh;
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.geometry).toBe(geometry);
    expect(standardMaterialsOf(first.content)[0]!.color.getHexString()).toBe("ff0000");
    expect(standardMaterialsOf(second.content)[0]!.color.getHexString()).toBe("abcdef");
    expect(material.color.getHexString()).toBe("abcdef");
    expect(source.parent).toBeNull();
    expect(second.position.map(Math.abs)).toEqual([0, 0, 0]);
  });

  test("retuning placement keeps the clone; replacement and unmount release only owned resources", async () => {
    const { source, material, geometry } = sourceModel();
    const h = await harness(source);
    await h.render([{ model: { url: h.url, anchor: "origin" } }]);
    const first = h.instances[0]!;
    let disposed = 0, sourceDisposed = 0;
    standardMaterialsOf(first.content)[0]!.addEventListener("dispose", () => disposed++);
    material.addEventListener("dispose", () => sourceDisposed++);
    geometry.addEventListener("dispose", () => sourceDisposed++);
    await h.render([{ model: { url: h.url, anchor: "origin", scale: 2, y: 1 } }]);
    expect(h.instances[0]!.content).toBe(first.content);
    expect(h.instances[0]!.position.map(Math.abs)).toEqual([0, 1, 0]);
    expect(h.instances[0]!.scale).toBe(2);
    expect(disposed).toBe(0);
    await h.render([{ model: { url: h.url, shadows: "none" } }]);
    const next = h.instances[0]!;
    expect(next.content).not.toBe(first.content);
    expect(disposed).toBe(1);
    let nextDisposed = 0;
    standardMaterialsOf(next.content)[0]!.addEventListener("dispose", () => nextDisposed++);
    await act(async () => h.root.render(null));
    expect(nextDisposed).toBe(1);
    expect(sourceDisposed).toBe(0);
  });

  test("uses the shared animation driver on content while retaining the placement frame", async () => {
    const { source } = sourceModel();
    const clip = new THREE.AnimationClip("root", 1, [
      new THREE.VectorKeyframeTrack(".position", [0, 1], [7, 5, -4, 9, 5, -4]),
    ]);
    const h = await harness(source, [clip]);
    await h.render([{ model: { url: h.url, anchor: "origin", scale: 0.5, y: 1,
      animation: { clip: "root", paused: true, time: 0.5 } } }]);
    const instance = h.instances[0]!;
    expect(instance.content.position.toArray()).toEqual([8, 5, -4]);
    expect(instance.scene.position.toArray().map(Math.abs)).toEqual([0, 1, 0]);
    expect(source.position.toArray()).toEqual([7, 5, -4]);
    await h.render([{ model: { url: h.url, anchor: "origin", scale: 0.5, y: 1, animation: "none" } }]);
    expect(h.instances[0]!.content).toBe(instance.content);
    expect(instance.content.position.toArray()).toEqual([7, 5, -4]);
  });

  test("retuning target height after root animation uses the original configured bind frame", async () => {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
    const clip = new THREE.AnimationClip("root", 1, [
      new THREE.VectorKeyframeTrack(".position", [0, 1], [0, 0, 0, 0, 10, 0]),
    ]);
    const h = await harness(source, [clip]);
    const animation = { clip: "root", paused: true, time: 0.5 };
    await h.render([{ model: { url: h.url, targetHeight: 2, animation } }]);
    const first = h.instances[0]!;
    expect(first.content.position.y).toBe(5);
    await h.render([{ model: { url: h.url, targetHeight: 4, animation } }]);
    expect(h.instances[0]!.content).toBe(first.content);
    expect(h.instances[0]!.scale).toBe(2);
    expect(h.instances[0]!.position[1]).toBe(2);
  });

  test("bind-pose placement ignores a cached skinned pose and releases independent bone textures", async () => {
    const source = new THREE.Group();
    source.position.set(3, 5, -2);
    const bone = new THREE.Bone();
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const count = geometry.getAttribute("position").count;
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    const weights = new Float32Array(count * 4);
    for (let index = 0; index < count; index++) weights[index * 4] = 1;
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
    mesh.add(bone);
    source.add(mesh);
    source.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton([bone]));
    modelBindPosePositions(mesh);
    bone.scale.y = 4;
    source.updateMatrixWorld(true);
    mesh.skeleton.update();
    const h = await harness(source);
    await h.render([{ model: { url: h.url, targetHeight: 1.8, y: 0.2 } }]);
    const instance = h.instances[0]!;
    expect(instance.scale).toBeCloseTo(0.9, 6);
    expect(instance.position[1]).toBeCloseTo(-3.4, 6);
    const rig = (instance.content.children[0] as THREE.SkinnedMesh).skeleton;
    expect(rig).not.toBe(mesh.skeleton);
    rig.computeBoneTexture();
    let released = 0;
    rig.boneTexture!.addEventListener("dispose", () => released++);
    await act(async () => h.root.render(null));
    expect(released).toBe(1);
    expect(bone.scale.y).toBe(4);
  });

  test("EntityModel reports initial colliders before a held animation moves the imported root", async () => {
    const { source } = sourceModel();
    const clip = new THREE.AnimationClip("root", 1, [
      new THREE.VectorKeyframeTrack(".position", [0, 1], [7, 5, -4, 9, 5, -4]),
    ]);
    const h = await harness(source, [clip]);
    const bounds: MeasuredLocalBounds[] = [];
    const triangles: MeasuredCollisionTriangles[] = [];
    const context = { scene: { entity: {
      reportBounds(_key: string, value: MeasuredLocalBounds) { bounds.push(value); return true; },
      reportCollisionMesh(_key: string, value: MeasuredCollisionTriangles) { triangles.push(value); return true; },
    } } } as unknown as GameContext;
    await act(async () => {
      h.root.render(createElement(GameProvider, { context }, createElement(Suspense, { fallback: null },
        createElement(EntityModel, {
          model: { url: h.url, targetHeight: 1.8, animation: { clip: "root", paused: true, time: 0.5 } },
          measure: { target: "entity", key: "hero" },
        }))));
    });
    expect(bounds).toHaveLength(1);
    expect((bounds[0]!.min[0] + bounds[0]!.max[0]) / 2).toBeCloseTo(0, 6);
    expect(triangles).toHaveLength(1);
    const xs = Array.from(triangles[0]!.positions).filter((_value, index) => index % 3 === 0);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 6);
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, createRoot, useThree, type ReconcilerRoot } from "@react-three/fiber";
import { Component, createElement, Suspense, type ReactNode } from "react";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { MaterialAsset } from "@jgengine/core/material/materialAsset";
import { MATERIAL_TEXTURE_SEMANTICS, type MaterialTextureRole } from "@jgengine/core/material/materialAsset";
import { MATERIAL_TEXTURE_PROPERTIES } from "../materialOverride";
import { GameProvider } from "@jgengine/react/provider";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { resolveRigNode } from "./rigNode";

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
  test("EntityModel loads all simple physical map roles into owned views without changing imported maps", async () => {
    const source = new THREE.Group();
    const imported = new THREE.Texture();
    const original = new THREE.MeshStandardMaterial({ normalMap: imported });
    const geometry = new THREE.BoxGeometry();
    source.add(new THREE.Mesh(geometry, original));
    const h = await harness(source);
    const roles = Object.keys(MATERIAL_TEXTURE_SEMANTICS) as MaterialTextureRole[];
    const maps = Object.fromEntries(roles.map(role => [role, `/ordinary-${h.url}-${role}.png`]));
    const cached = new Map<string, THREE.Texture>();
    const views: { texture: THREE.Texture; disposals: number }[] = [];
    let borrowedDisposals = 0;
    const load = THREE.TextureLoader.prototype.load;
    THREE.TextureLoader.prototype.load = (url, onLoad) => {
      let texture = cached.get(url);
      if (texture === undefined) {
        texture = new THREE.Texture(); texture.name = url;
        texture.addEventListener("dispose", () => borrowedDisposals++);
        const clone = texture.clone;
        texture.clone = function () {
          const view = { texture: clone.call(this), disposals: 0 };
          view.texture.addEventListener("dispose", () => view.disposals++);
          views.push(view);
          return view.texture;
        };
        cached.set(url, texture);
      }
      onLoad?.(texture);
      return texture as THREE.Texture<HTMLImageElement>;
    };
    imported.addEventListener("dispose", () => borrowedDisposals++);
    geometry.addEventListener("dispose", () => borrowedDisposals++);
    original.addEventListener("dispose", () => borrowedDisposals++);
    try {
      let scene!: THREE.Scene;
      function Inspect() { scene = useThree(state => state.scene); return null; }
      const first: ModelConfig = { url: h.url, material: { maps, sheen: 0.4, clearcoat: 0.6, transmission: 0.5 } };
      const second: ModelConfig = { url: h.url, material: { maps: { sheenColor: maps.sheenColor, specularColor: maps.specularColor, clearcoat: maps.clearcoat } } };
      await act(async () => h.root.render(createElement(Suspense, { fallback: null }, createElement(EntityModel, { model: first }), createElement(EntityModel, { model: second }), createElement(Inspect))));
      const meshes: THREE.Mesh[] = [];
      scene.traverse(node => { if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh); });
      const firstMaterial = meshes[0]!.material as THREE.MeshPhysicalMaterial;
      const secondMaterial = meshes[1]!.material as THREE.MeshPhysicalMaterial;
      expect(firstMaterial.isMeshPhysicalMaterial).toBe(true);
      expect(secondMaterial.isMeshPhysicalMaterial).toBe(true);
      for (const role of roles) {
        const texture = (firstMaterial as unknown as Record<string, THREE.Texture>)[MATERIAL_TEXTURE_PROPERTIES[role]]!;
        expect(texture.name).toBe(maps[role]);
        expect(texture).not.toBe(cached.get(maps[role]!));
        expect(texture.colorSpace).toBe(MATERIAL_TEXTURE_SEMANTICS[role].colorSpace === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace);
        expect(texture.flipY).toBe(false);
      }
      expect(secondMaterial.normalMap).toBe(imported);
      expect(secondMaterial.sheenColorMap).not.toBe(firstMaterial.sheenColorMap);
      expect(meshes.every(mesh => mesh.geometry === geometry)).toBe(true);
      expect(original.normalMap).toBe(imported);
      expect(cached.size).toBe(20);
      expect([...cached.values()].every(texture => texture.colorSpace === THREE.NoColorSpace && texture.flipY)).toBe(true);
      expect(views).toHaveLength(23);
      const materialDisposals = [0, 0];
      firstMaterial.addEventListener("dispose", () => materialDisposals[0]++);
      secondMaterial.addEventListener("dispose", () => materialDisposals[1]++);
      await act(async () => h.root.render(null));
      expect(views.every(view => view.disposals === 1)).toBe(true);
      expect(materialDisposals).toEqual([1, 1]);
      expect(borrowedDisposals).toBe(0);
    } finally {
      THREE.TextureLoader.prototype.load = load;
    }
  });

  test("EntityModel rejects malformed JSON visibility before texture or clone allocation", async () => {
    const report = globalThis.reportError; globalThis.reportError = () => {};
    const texture = new THREE.Texture();
    const load = THREE.TextureLoader.prototype.load;
    let loads = 0, views = 0, clones = 0, caught = 0;
    THREE.TextureLoader.prototype.load = (_url, onLoad) => { loads++; onLoad?.(texture); return texture as THREE.Texture<HTMLImageElement>; };
    const cloneTexture = texture.clone;
    texture.clone = function () { views++; return cloneTexture.call(this); };
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      componentDidCatch() { caught++; }
      render() { return this.state.failed ? null : this.props.children; }
    }
    try {
      for (const hiddenNodes of ["Body", [1], [" "], ["Body", null]]) {
        const source = new THREE.Group();
        const material = new THREE.MeshStandardMaterial();
        const cloneMaterial = material.clone;
        material.clone = function () { clones++; return cloneMaterial.call(this); };
        const body = new THREE.Mesh(new THREE.BoxGeometry(), material); body.name = "Body"; source.add(body);
        const h = await harness(source);
        const model: ModelConfig = JSON.parse(JSON.stringify({ url: h.url, hiddenNodes, material: { maps: { color: `/malformed-visibility-${h.url}.png` } } }));
        await act(async () => h.root.render(createElement(Boundary, { children: createElement(Suspense, { fallback: null }, createElement(EntityModel, { model })) })));
        await act(async () => h.root.render(null));
        expect(body.visible).toBe(true);
      }
      expect(caught).toBe(4); expect(loads).toBe(0); expect(views).toBe(0); expect(clones).toBe(0);
    } finally {
      globalThis.reportError = report; THREE.TextureLoader.prototype.load = load; texture.clone = cloneTexture;
    }
  });

  test("real modular Rogue instances select accessories without removing rigs, clips or borrowed resources", async () => {
    const bytes = readFileSync(new URL("../../../../apps/dev/public/models/kaykit-adventurers/Rogue_Hooded.glb", import.meta.url));
    const image = new THREE.Texture();
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
      .register(() => ({ name: "headless-image-fixture", loadTexture: async () => image }))
      .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    const names = ["Knife", "Knife_Offhand", "1H_Crossbow", "2H_Crossbow", "Throwable", "Rogue_Cape"];
    expect(names.every(name => gltf.scene.getObjectByName(name)?.visible)).toBe(true);
    const h = await harness(gltf.scene, gltf.animations);
    const model: ModelInstanceConfig = { url: h.url, targetHeight: 1.8, animation: { clip: "Walking_A", paused: true, time: 0.25 } };
    const clipNames = gltf.animations.map(clip => clip.name);
    await h.render([{ model: { ...model, hiddenNodes: names } }, { model: { ...model, hiddenNodes: ["Knife"] } }]);
    const first = h.instances[0]!, second = h.instances[1]!;
    expect(names.every(name => first.content.getObjectByName(name)?.visible === false)).toBe(true);
    expect(second.content.getObjectByName("Knife")!.visible).toBe(false);
    expect(second.content.getObjectByName("2H_Crossbow")!.visible).toBe(true);
    expect(names.every(name => gltf.scene.getObjectByName(name)?.visible)).toBe(true);
    const body = first.content.getObjectByName("Rogue_Body") as THREE.SkinnedMesh;
    const peerBody = second.content.getObjectByName("Rogue_Body") as THREE.SkinnedMesh;
    const sourceBody = gltf.scene.getObjectByName("Rogue_Body") as THREE.SkinnedMesh;
    expect(body.visible).toBe(true);
    expect(body.geometry).toBe(sourceBody.geometry);
    expect(body.skeleton).not.toBe(sourceBody.skeleton);
    expect(body.skeleton).not.toBe(peerBody.skeleton);
    expect(body.skeleton.bones.length).toBe(sourceBody.skeleton.bones.length);
    expect((body.material as THREE.MeshStandardMaterial).map).toBe(image);
    expect(body.material).not.toBe(sourceBody.material);
    expect(gltf.animations.map(clip => clip.name)).toEqual(clipNames);
    const slot = resolveRigNode(first.content, "handslot.r").node!;
    const sourceSlot = resolveRigNode(gltf.scene, "handslot.r").node!;
    expect(slot).toBeDefined(); expect(slot).not.toBe(sourceSlot);
    const attachment = new THREE.Object3D(); attachment.position.set(0.1, 0.2, 0.3); slot.add(attachment);
    first.scene.updateMatrixWorld(true);
    expect(attachment.getWorldPosition(new THREE.Vector3()).distanceTo(attachment.position.clone().applyMatrix4(slot.matrixWorld))).toBeLessThan(1e-6);
    const mixer = new THREE.AnimationMixer(first.content);
    const sourceBind = sourceSlot.getWorldPosition(new THREE.Vector3());
    const before = slot.getWorldPosition(new THREE.Vector3());
    mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, "Walking_A")!).play(); mixer.update(0.45);
    first.scene.updateMatrixWorld(true);
    expect(slot.getWorldPosition(new THREE.Vector3()).distanceTo(before)).toBeGreaterThan(0.001);
    expect(sourceSlot.getWorldPosition(new THREE.Vector3()).distanceTo(sourceBind)).toBeLessThan(1e-6);
    expect(attachment.parent).toBe(slot);
    mixer.stopAllAction(); mixer.uncacheRoot(first.content);
    let released = 0, borrowedReleased = 0;
    (body.material as THREE.Material).addEventListener("dispose", () => released++);
    for (const borrowed of [sourceBody.geometry, sourceBody.material as THREE.Material, image]) borrowed.addEventListener("dispose", () => borrowedReleased++);
    await h.render([{ model }, { model: { ...model, hiddenNodes: ["Knife"] } }]);
    expect(h.instances[0]!.content.getObjectByName("Knife")!.visible).toBe(true);
    expect(h.instances[1]!.content).toBe(second.content);
    expect(released).toBe(1); expect(borrowedReleased).toBe(0);
    await act(async () => h.root.render(null));
    expect(borrowedReleased).toBe(0);
  });

  test("hidden node content changes rebuild only that instance before placement measurement", async () => {
    const source = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()); body.name = "Body";
    const accessory = new THREE.Group(); accessory.name = "Accessory";
    accessory.position.y = 10;
    accessory.add(new THREE.Mesh(body.geometry, body.material));
    const importedHidden = new THREE.Mesh(body.geometry, body.material); importedHidden.name = "ImportedHidden"; importedHidden.visible = false;
    source.add(body, accessory, importedHidden);
    const h = await harness(source);
    const selected = { url: h.url, targetHeight: 2, hiddenNodes: ["Accessory", "ImportedHidden"] };
    const legacy = { url: h.url, targetHeight: 2 };
    await h.render([{ model: selected }, { model: legacy }]);
    const first = h.instances[0]!, second = h.instances[1]!;
    expect(first.content.getObjectByName("Accessory")!.visible).toBe(false);
    expect(first.scale).toBe(1);
    expect(second.scale).toBeCloseTo(1 / 6);
    expect(second.content.getObjectByName("Accessory")!.visible).toBe(true);
    expect(source.getObjectByName("Accessory")!.visible).toBe(true);
    await h.render([{ model: { ...selected, hiddenNodes: ["ImportedHidden", "Accessory", "Accessory"] } }, { model: legacy }]);
    expect(h.instances[0]!.content).toBe(first.content);
    expect(h.instances[1]!.content).toBe(second.content);
    let released = 0;
    standardMaterialsOf(first.content)[0]!.addEventListener("dispose", () => released++);
    await h.render([{ model: { ...selected, hiddenNodes: [] } }, { model: legacy }]);
    expect(h.instances[0]!.content).not.toBe(first.content);
    expect(h.instances[0]!.content.getObjectByName("Accessory")!.visible).toBe(true);
    expect(h.instances[0]!.content.getObjectByName("ImportedHidden")!.visible).toBe(false);
    expect(h.instances[1]!.content).toBe(second.content);
    expect(released).toBe(1);
    const empty = h.instances[0]!.content;
    await h.render([{ model: { ...selected, hiddenNodes: undefined } }, { model: legacy }]);
    expect(h.instances[0]!.content).toBe(empty);
  });

  test("EntityModel rejects invalid assignments before texture loads, views or model clones", async () => {
    const report = globalThis.reportError;
    globalThis.reportError = () => {};
    const texture = new THREE.Texture();
    const load = THREE.TextureLoader.prototype.load;
    let loads = 0, views = 0, materialClones = 0, caught = 0;
    THREE.TextureLoader.prototype.load = (_url, onLoad) => { loads++; onLoad?.(texture); return texture as THREE.Texture<HTMLImageElement>; };
    const clone = texture.clone;
    texture.clone = function () { views++; return clone.call(this); };
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      componentDidCatch() { caught++; }
      render() { return this.state.failed ? null : this.props.children; }
    }
    try {
      for (const failure of ["selector", "uv", "transmission"] as const) {
        const source = new THREE.Group();
        const material = new THREE.MeshPhysicalMaterial({ transparent: failure !== "transmission", map: texture }); material.name = "panel";
        const originalClone = material.clone;
        material.clone = function () { materialClones++; return originalClone.call(this); };
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material); mesh.name = "facade";
        if (failure === "uv") mesh.geometry.deleteAttribute("uv");
        source.add(mesh);
        const h = await harness(source);
        const asset: MaterialAsset = { schemaVersion: 1, id: failure, name: failure, family: "glass", capabilities: ["pbr", "transmission"], surface: failure === "transmission" ? { transmission: 0.7 } : {}, textures: { color: { url: `invalid-${failure}-${h.url}.png`, colorSpace: "srgb" } } };
        const model: ModelConfig = { url: h.url, ...(failure === "transmission" ? { material: { alphaMode: "blend" as const } } : {}), materialAssets: [asset], materialAssignments: [{ materialId: asset.id, selector: { mesh: failure === "selector" ? "missing" : "facade" } }] };
        await act(async () => h.root.render(createElement(Boundary, { children: createElement(Suspense, { fallback: null }, createElement(EntityModel, { model })) })));
        await act(async () => h.root.render(null));
        expect(mesh.material).toBe(material);
        expect(material.map).toBe(texture);
      }
      expect(caught).toBe(3);
      expect(loads).toBe(0);
      expect(views).toBe(0);
      expect(materialClones).toBe(0);
    } finally {
      globalThis.reportError = report;
      THREE.TextureLoader.prototype.load = load;
      texture.clone = clone;
    }
  });

  test("EntityModel preflight respects all-slot opaque coverage before named transmission", async () => {
    const source = new THREE.Group();
    const material = new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.4 }); material.name = "glass";
    source.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    const h = await harness(source);
    const asset: MaterialAsset = { schemaVersion: 1, id: "glass", name: "Glass", family: "glass", capabilities: ["pbr", "transmission"], surface: { transmission: 0.7 } };
    const model: ModelConfig = { url: h.url, material: { alphaMode: "opaque" }, materialAssets: [asset], materialAssignments: [{ materialId: "glass", selector: { slot: "glass" } }] };
    let scene!: THREE.Scene;
    function Inspect() { scene = useThree(state => state.scene); return null; }
    await act(async () => h.root.render(createElement(Suspense, { fallback: null }, createElement(EntityModel, { model }), createElement(Inspect))));
    const content = scene.children[0] as THREE.Group;
    const mesh = content.children[0]!.children[0] as THREE.Mesh;
    expect((mesh.material as THREE.MeshPhysicalMaterial).transmission).toBe(0.7);
    expect((mesh.material as THREE.MeshPhysicalMaterial).transparent).toBe(false);
    expect(material.transparent).toBe(true);
    expect(material.transmission).toBe(0);
  });

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

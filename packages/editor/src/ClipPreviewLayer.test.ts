import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { act, createRoot, extend, type ReconcilerRoot, type RootStore } from "@react-three/fiber";
import { createElement } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createAnimGraphRuntime, type AnimGraph } from "@jgengine/core/anim/animGraph";
import { sharedGltfLoader } from "@jgengine/shell/render/modelLoad";
import { standardMaterialsOf } from "@jgengine/shell/render/modelRender";
import { createGraphPose } from "@jgengine/shell/render/useModelAnimation";
import { useModelInstance, type ModelInstance } from "@jgengine/shell/render/useModelInstance";
import { ClipPreviewLayer } from "./ClipPreviewLayer";
import { createEditorUiStore } from "./uiStore";
import { previewAnimationConfig, type ClipPreviewSession } from "./shell/clipPreview";
import type { EditorHostApi } from "./session";

const roots: ReconcilerRoot<HTMLCanvasElement>[] = [];
const originalLoad = sharedGltfLoader.load;
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
let nextUrl = 0;
extend({ Group: THREE.Group });
beforeEach(() => { actEnvironment.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  sharedGltfLoader.load = originalLoad;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

async function importedKnight(): Promise<GLTF> {
  const bytes = readFileSync(new URL("../../../apps/dev/public/models/kaykit-adventurers/Knight.glb", import.meta.url));
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

async function harness(gltf: GLTF, clipName: string | null = "Walking_A") {
  const url = `/editor-knight-preview-${nextUrl++}.glb`;
  gltf.scene.name = "ImportedKnightRoot";
  let loads = 0;
  sharedGltfLoader.load = (_url, onLoad) => { loads++; onLoad(gltf); };
  const focus = { x: 12, y: 3, z: -8 };
  const api = { getFocusTarget: () => focus } as EditorHostApi;
  const ui = createEditorUiStore();
  const session: ClipPreviewSession = {
    source: { assetId: url, label: "Knight", url, clips: gltf.animations.map((clip) => clip.name) },
    driver: { clipName, playing: false, loop: true, speed: 1, time: 0.35 },
    duration: 0,
  };
  ui.patch({ clipPreview: session });
  const root = createRoot({} as HTMLCanvasElement);
  roots.push(root);
  await root.configure({
    frameloop: "never", size: { width: 100, height: 100, top: 0, left: 0 }, dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as THREE.WebGLRenderer,
  });
  let reference: ModelInstance;
  function Reference() {
    reference = useModelInstance({ url, targetHeight: 2, animation: previewAnimationConfig(session.driver) });
    return createElement("group", { name: "referenceFocus", position: [focus.x, focus.y, focus.z] },
      createElement("primitive", { object: reference.scene, position: reference.position, scale: reference.scale }));
  }
  let store: RootStore;
  await act(async () => {
    store = root.render(createElement("group", null,
      createElement("group", { name: "editorPreview" }, createElement(ClipPreviewLayer, { api, ui })),
      createElement(Reference)));
  });
  const preview = () => store.getState().scene.getObjectByName("editorPreview")!.getObjectByName("ImportedKnightRoot")!;
  return { root, ui, preview, reference: () => reference, loads: () => loads };
}

function worldSkinSamples(root: THREE.Object3D): THREE.Vector3[] {
  root.updateWorldMatrix(true, true);
  const samples: THREE.Vector3[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh !== true) return;
    mesh.skeleton.update();
    const count = mesh.geometry.getAttribute("position").count;
    for (let index = 0; index < count; index += 31) samples.push(mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
  });
  return samples;
}

describe("ClipPreviewLayer imported rig parity", () => {
  test("a translated and scaled Knight matches runtime skin vertices without replacing imported transforms", async () => {
    const gltf = await importedKnight();
    gltf.scene.position.set(4, 6, -3);
    gltf.scene.scale.set(2, 3, 4);
    gltf.scene.rotation.y = 0.7;
    const h = await harness(gltf);
    const preview = h.preview();
    const actual = worldSkinSamples(preview);
    const expected = worldSkinSamples(h.reference().content);
    expect(actual.length).toBeGreaterThan(100);
    expect(actual).toHaveLength(expected.length);
    expect(Math.max(...actual.map((vertex, index) => vertex.distanceTo(expected[index]!)))).toBeLessThan(1e-5);
    expect(preview.position.toArray()).toEqual([4, 6, -3]);
    expect(preview.scale.toArray()).toEqual([2, 3, 4]);
    expect(preview.rotation.y).toBeCloseTo(0.7, 6);
    expect(gltf.scene.position.toArray()).toEqual([4, 6, -3]);
    expect(gltf.scene.scale.toArray()).toEqual([2, 3, 4]);
    expect(h.loads()).toBe(1);
    expect(h.ui.getState().clipPreview!.duration).toBe(THREE.AnimationClip.findByName(gltf.animations, "Walking_A")!.duration);
  });

  test("closing a preview releases its bone texture and materials without touching the cached rig or another instance", async () => {
    const gltf = await importedKnight();
    const h = await harness(gltf, null);
    const preview = h.preview();
    let mesh: THREE.SkinnedMesh | undefined;
    preview.traverse((object) => { if (mesh === undefined && (object as THREE.SkinnedMesh).isSkinnedMesh === true) mesh = object as THREE.SkinnedMesh; });
    mesh!.skeleton.computeBoneTexture();
    let previewBonesDisposed = 0, previewMaterialsDisposed = 0, borrowedDisposed = 0, otherDisposed = 0;
    mesh!.skeleton.boneTexture!.addEventListener("dispose", () => previewBonesDisposed++);
    standardMaterialsOf(preview)[0]!.addEventListener("dispose", () => previewMaterialsDisposed++);
    standardMaterialsOf(gltf.scene)[0]!.addEventListener("dispose", () => borrowedDisposed++);
    mesh!.geometry.addEventListener("dispose", () => borrowedDisposed++);
    standardMaterialsOf(h.reference().content)[0]!.addEventListener("dispose", () => otherDisposed++);
    await act(async () => h.ui.patch({ clipPreview: null }));
    expect(previewBonesDisposed).toBe(1);
    expect(previewMaterialsDisposed).toBe(1);
    expect(borrowedDisposed).toBe(0);
    expect(otherDisposed).toBe(0);
    expect(h.reference().content.parent).toBe(h.reference().scene);
  });

  test("an imported root-motion graph poses content inside the unchanged placement frame", async () => {
    const gltf = await importedKnight();
    gltf.scene.position.set(4, 6, -3);
    gltf.scene.scale.setScalar(3);
    gltf.scene.rotation.y = 0.7;
    const h = await harness(gltf, null);
    const preview = h.preview();
    const originalParent = preview.parent;
    originalParent!.updateMatrix();
    const placement = originalParent!.matrix.clone();
    const graph: AnimGraph = { layers: [{ id: "base", entry: "dodge", states: { dodge: { kind: "clip", clip: "Dodge_Left", rootMotion: true, loop: false } }, transitions: [] }] };
    const reference = createGraphPose(h.reference().content, graph, gltf.animations);
    try {
      const output = createAnimGraphRuntime(graph).advance(0.2, {}, reference.durations);
      expect(Math.hypot(...output.rootDelta!)).toBeGreaterThan(0.01);
      await act(async () => h.ui.patch({ clipPreview: { ...h.ui.getState().clipPreview!, graphPose: { graph, clips: output.clips, rootMotion: output.rootMotion } } }));
      reference.apply(output.clips, output.rootMotion);
      const actual = worldSkinSamples(preview);
      const expected = worldSkinSamples(h.reference().content);
      expect(Math.max(...actual.map((vertex, index) => vertex.distanceTo(expected[index]!)))).toBeLessThan(1e-5);
      expect(preview.parent).toBe(originalParent);
      expect(originalParent!.matrix.equals(placement)).toBe(true);
      expect(preview.position.toArray()).toEqual([4, 6, -3]);
      expect(preview.scale.toArray()).toEqual([3, 3, 3]);
      expect(preview.getObjectByName("hips")!.position.x).toBe(h.reference().content.getObjectByName("hips")!.position.x);
      expect(preview.getObjectByName("hips")!.position.z).toBe(h.reference().content.getObjectByName("hips")!.position.z);
    } finally {
      reference.dispose();
    }
  });
});

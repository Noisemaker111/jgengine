import { expect, test } from "bun:test";
import * as THREE from "three";

import { setCulled, skipCulledMatrices } from "@jgengine/core/visibility/culledTransforms.draw";
import { BATCHED_SOURCE_LAYER, batchSceneDraws, DRAW_BATCH_MESH_KEY, markNeutralRenderHook, sceneRaycaster } from "./drawBatches.draw";

function setup() {
  const scene = new THREE.Scene();
  skipCulledMatrices(scene);
  const batcher = batchSceneDraws(scene, new THREE.Raycaster());
  return { scene, batcher };
}

function batchesOf(scene: THREE.Scene): THREE.BatchedMesh[] {
  return scene.children.filter((child): child is THREE.BatchedMesh => child.userData[DRAW_BATCH_MESH_KEY] === true);
}

function car(scene: THREE.Object3D, x: number, body: THREE.Material, glass: THREE.Material) {
  const root = new THREE.Group();
  root.position.set(x, 0, 0);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), body);
  hull.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 2), glass);
  cabin.position.y = 0.9;
  cabin.castShadow = true;
  root.add(hull, cabin);
  scene.add(root);
  return { root, hull, cabin };
}

function instanceMatrix(batch: THREE.BatchedMesh, index: number): number[] {
  return batch.getMatrixAt(index, new THREE.Matrix4()).elements.slice(12, 15);
}

test("many models cut from the same materials draw as one batch per material, and leave three's own passes", () => {
  const { scene, batcher } = setup();
  const body = new THREE.MeshStandardMaterial({ color: "#c33" });
  const glass = new THREE.MeshStandardMaterial({ color: "#223", roughness: 0.1 });
  const cars = Array.from({ length: 20 }, (_, index) => car(scene, index * 5, body.clone(), glass.clone()));
  scene.updateMatrixWorld();
  const batches = batchesOf(scene);
  expect(batches).toHaveLength(2);
  expect(batcher.stats()).toMatchObject({ batched: 40, single: 0, batches: 2, drawn: 2, shown: 40 });
  for (const { hull, cabin } of cars) {
    expect(hull.layers.mask).toBe(1 << BATCHED_SOURCE_LAYER);
    expect(cabin.layers.mask).toBe(1 << BATCHED_SOURCE_LAYER);
    expect(hull.layers.test(new THREE.Camera().layers)).toBe(false);
  }
  expect(batches.every((batch) => batch.castShadow && batch.perObjectFrustumCulled)).toBe(true);
});

test("a moved model writes only its own instances, and a still one costs no write", () => {
  const { scene } = setup();
  const body = new THREE.MeshStandardMaterial();
  const glass = new THREE.MeshStandardMaterial({ roughness: 0.2 });
  const first = car(scene, 0, body, glass);
  const second = car(scene, 10, body, glass);
  scene.updateMatrixWorld();
  const [hulls] = batchesOf(scene).filter((batch) => batch.material instanceof THREE.MeshStandardMaterial && batch.material.roughness !== 0.2);
  if (hulls === undefined) throw new Error("no hull batch");
  const texture = (hulls as unknown as { _matricesTexture: THREE.DataTexture })._matricesTexture;
  const before = texture.version;
  scene.updateMatrixWorld();
  expect(texture.version).toBe(before);
  second.root.position.x = 30;
  scene.updateMatrixWorld();
  expect(texture.version).toBeGreaterThan(before);
  expect([instanceMatrix(hulls, 0), instanceMatrix(hulls, 1)]).toEqual([[0, 0, 0], [30, 0, 0]]);
  expect(first.hull.matrixWorld.elements[12]).toBe(0);
});

test("a hidden or culled model hides its instances, and shows them again where it moved meanwhile", () => {
  const { scene, batcher } = setup();
  const body = new THREE.MeshStandardMaterial();
  const glass = new THREE.MeshStandardMaterial({ roughness: 0.2 });
  const hidden = car(scene, 0, body, glass);
  const culled = car(scene, 10, body, glass);
  car(scene, 20, body, glass);
  scene.updateMatrixWorld();
  hidden.root.visible = false;
  culled.root.visible = false;
  setCulled(culled.root, true);
  scene.updateMatrixWorld();
  expect(batcher.stats().shown).toBe(2);
  culled.root.position.x = 50;
  culled.root.visible = true;
  setCulled(culled.root, false);
  scene.updateMatrixWorld();
  expect(batcher.stats().shown).toBe(4);
  const [batch] = batchesOf(scene);
  if (batch === undefined) throw new Error("no batch");
  expect(instanceMatrix(batch, 1)[0]).toBe(50);
});

test("a material whose look changes draws on its own until it settles, then rejoins", () => {
  const { scene, batcher } = setup();
  const glass = new THREE.MeshStandardMaterial({ roughness: 0.2 });
  const flashing = new THREE.MeshStandardMaterial();
  const subject = car(scene, 0, flashing, glass);
  car(scene, 10, new THREE.MeshStandardMaterial(), glass);
  scene.updateMatrixWorld();
  expect(batcher.stats().batched).toBe(4);
  flashing.emissive.setRGB(1, 1, 1);
  scene.updateMatrixWorld();
  expect(subject.hull.layers.mask).toBe(1);
  expect(batcher.stats()).toMatchObject({ batched: 3, single: 1 });
  for (let pass = 0; pass < 100; pass += 1) scene.updateMatrixWorld();
  expect(subject.hull.layers.mask).toBe(1 << BATCHED_SOURCE_LAYER);
  expect(batcher.stats()).toMatchObject({ batched: 4, single: 0, batches: 3 });
});

test("shapes a shared draw cannot take keep their own draw", () => {
  const { scene, batcher } = setup();
  const opaque = new THREE.MeshStandardMaterial();
  const transparent = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 }));
  const hooked = new THREE.Mesh(new THREE.BoxGeometry(), opaque);
  hooked.onBeforeRender = () => {};
  const mirrored = new THREE.Mesh(new THREE.BoxGeometry(), opaque);
  mirrored.scale.x = -1;
  const layered = new THREE.Mesh(new THREE.BoxGeometry(), opaque);
  layered.layers.set(2);
  const multi = new THREE.Mesh(new THREE.BoxGeometry(), [opaque, opaque]);
  scene.add(transparent, hooked, mirrored, layered, multi);
  scene.updateMatrixWorld();
  expect(batcher.stats()).toMatchObject({ batched: 0, single: 5, reasons: { transparent: 1, renderHook: 1, mirrored: 1, layers: 1, multiMaterial: 1 } });
  expect([transparent, hooked, mirrored, multi].every((mesh) => mesh.layers.mask === 1)).toBe(true);
  expect(layered.layers.mask).toBe(1 << 2);
});

test("a removed model gives its instances back and its own draw, and the empty batch leaves the scene", () => {
  const { scene, batcher } = setup();
  const body = new THREE.MeshStandardMaterial();
  const glass = new THREE.MeshStandardMaterial({ roughness: 0.2 });
  const gone = car(scene, 0, body, glass);
  scene.updateMatrixWorld();
  gone.root.removeFromParent();
  for (let pass = 0; pass < 601; pass += 1) scene.updateMatrixWorld();
  expect(batcher.stats()).toMatchObject({ batched: 0, batches: 0 });
  expect(gone.hull.layers.mask).toBe(1);
  expect(batchesOf(scene)).toHaveLength(0);
});

test("picking still hits a batched mesh, and never the batch", () => {
  const { scene } = setup();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  mesh.position.z = -5;
  scene.add(mesh);
  scene.updateMatrixWorld();
  const ray = sceneRaycaster();
  ray.set(new THREE.Vector3(0.1, 0.2, 0), new THREE.Vector3(0, 0, -1));
  const hits = ray.intersectObjects(scene.children, true);
  expect(hits.map((hit) => hit.object.type)).toEqual(["Mesh"]);
  expect(hits[0]?.object).toBe(mesh);
  expect(new THREE.Raycaster().layers.test(mesh.layers)).toBe(false);
});

test("a mesh whose render hook only watches (the cascaded shadows' swap check) still joins a batch", () => {
  const { scene, batcher } = setup();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const watch: THREE.Object3D["onBeforeRender"] = () => {};
  markNeutralRenderHook(watch);
  mesh.onBeforeRender = watch;
  scene.add(mesh);
  scene.updateMatrixWorld();
  expect(batcher.stats()).toMatchObject({ batched: 1, single: 0 });
  mesh.onBeforeRender = () => {};
  scene.updateMatrixWorld();
  expect(batcher.stats()).toMatchObject({ batched: 0, single: 1, reasons: { renderHook: 1 } });
  expect(mesh.layers.mask).toBe(1);
});

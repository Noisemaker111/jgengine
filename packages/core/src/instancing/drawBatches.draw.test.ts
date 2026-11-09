import { expect, test } from "bun:test";
import * as THREE from "three";

import { giveStableShadowDepth, isStableShadowDepth } from "@jgengine/core/lighting/shadowCasters.draw";
import { sceneWalkStarts, setCulled, skipCulledMatrices } from "@jgengine/core/visibility/culledTransforms.draw";
import { BATCHED_SOURCE_LAYER, batchSceneDraws, DRAW_BATCH_MESH_KEY, markNeutralRenderHook, sceneRaycaster } from "./drawBatches.draw";

function setup() {
  const scene = new THREE.Scene();
  skipCulledMatrices(scene);
  const batcher = batchSceneDraws(scene, new THREE.Raycaster());
  return { scene, batcher };
}

function batchesOf(scene: THREE.Scene): THREE.BatchedMesh[] {
  const batches: THREE.BatchedMesh[] = [];
  scene.traverse((node) => {
    if (node.userData[DRAW_BATCH_MESH_KEY] === true) batches.push(node as THREE.BatchedMesh);
  });
  return batches;
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
  const flat = new THREE.Mesh(new THREE.BoxGeometry(), opaque);
  flat.scale.y = 0;
  const layered = new THREE.Mesh(new THREE.BoxGeometry(), opaque);
  layered.layers.set(2);
  const multi = new THREE.Mesh(new THREE.BoxGeometry(), [opaque, opaque]);
  scene.add(transparent, hooked, flat, layered, multi);
  scene.updateMatrixWorld();
  expect(batcher.stats()).toMatchObject({ batched: 0, single: 5, reasons: { transparent: 1, renderHook: 1, flat: 1, layers: 1, multiMaterial: 1 } });
  expect([transparent, hooked, flat, multi].every((mesh) => mesh.layers.mask === 1)).toBe(true);
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

test("casters with a stable shadow depth batch, and the batch casts through its own; a foreign depth shader keeps its draw", () => {
  const { scene, batcher } = setup();
  const material = new THREE.MeshStandardMaterial();
  const stable = Array.from({ length: 3 }, (_, index) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.castShadow = true;
    mesh.position.x = index * 3;
    giveStableShadowDepth(mesh);
    return mesh;
  });
  const foreign = new THREE.Mesh(new THREE.BoxGeometry(), material);
  foreign.castShadow = true;
  foreign.customDepthMaterial = new THREE.MeshDepthMaterial();
  scene.add(...stable, foreign);
  scene.updateMatrixWorld();
  expect(batcher.stats()).toMatchObject({ batched: 3, single: 1, reasons: { customDepth: 1 } });
  const [batch] = batchesOf(scene);
  expect(batch?.customDepthMaterial !== undefined && isStableShadowDepth(batch.customDepthMaterial)).toBe(true);
});

test("meshes three must never cull batch apart from culled ones, in a batch that never culls", () => {
  const { scene, batcher } = setup();
  const material = new THREE.MeshStandardMaterial();
  const culled = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const unculled = new THREE.Mesh(new THREE.BoxGeometry(), material);
  unculled.frustumCulled = false;
  scene.add(culled, unculled);
  scene.updateMatrixWorld();
  expect(batcher.stats()).toMatchObject({ batched: 2, single: 0, batches: 2 });
  expect(batchesOf(scene).map((batch) => batch.perObjectFrustumCulled).sort()).toEqual([false, true]);
  unculled.frustumCulled = true;
  scene.updateMatrixWorld();
  expect(batcher.stats()).toMatchObject({ batched: 2, batches: 1 });
});

test("a batch draws with its material's own shader switches, which three's material copy drops", () => {
  const { scene } = setup();
  const material = new THREE.MeshStandardMaterial();
  material.defines = { ...material.defines, JG_TERRAIN_PAINT: "", JG_SURFACE_CLASSES: "7" };
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.BoxGeometry(), material));
  scene.updateMatrixWorld();
  const [batch] = batchesOf(scene);
  expect((batch?.material as THREE.Material | undefined)?.defines).toMatchObject({ STANDARD: "", JG_TERRAIN_PAINT: "", JG_SURFACE_CLASSES: "7" });
});

test("a batch the matrix pass creates is under one of that pass's render walk starts, so its sources never miss a frame", () => {
  const { scene } = setup();
  const material = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.BoxGeometry(), material));
  scene.updateMatrixWorld();
  const [batch] = batchesOf(scene);
  if (batch === undefined) throw new Error("no batch");
  expect(batch.visible).toBe(true);
  const starts = sceneWalkStarts(scene)?.starts ?? [];
  expect(starts.some((start) => start === batch || start === batch.parent)).toBe(true);
});

test("mirrored meshes draw in a batch whose own matrix carries the mirror, so three flips their winding and each lands where it stands; one that turns back moves batch", () => {
  const { scene, batcher } = setup();
  const paint = new THREE.MeshStandardMaterial();
  const left = new THREE.Mesh(new THREE.BoxGeometry(), paint);
  left.position.set(-4, 0, 2);
  left.scale.x = -1;
  const right = new THREE.Mesh(new THREE.BoxGeometry(), paint);
  right.position.set(4, 0, 2);
  scene.add(left, right);
  scene.updateMatrixWorld();
  expect(batcher.stats()).toMatchObject({ batched: 2, single: 0, batches: 2 });
  const mirroredBatch = batchesOf(scene).find((batch) => batch.matrixWorld.determinant() < 0);
  if (mirroredBatch === undefined) throw new Error("no mirrored batch");
  // What the batch draws for its instance: its own world matrix times the instance matrix.
  const drawn = mirroredBatch.matrixWorld.clone().multiply(mirroredBatch.getMatrixAt(0, new THREE.Matrix4()));
  expect(drawn.elements.map((value) => Math.round(value * 1e6) / 1e6)).toEqual(left.matrixWorld.elements.map((value) => Math.round(value * 1e6) / 1e6));
  scene.updateMatrixWorld();
  expect(mirroredBatch.matrixWorld.determinant()).toBeLessThan(0);
  left.scale.x = 1;
  scene.updateMatrixWorld();
  expect(batcher.stats()).toMatchObject({ batched: 2, single: 0, drawn: 1, shown: 2 });
});

function poles(material: THREE.Material, count: number, x: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 4), material, count);
  for (let index = 0; index < count; index += 1) mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(index * 3, 2, 0));
  mesh.position.x = x;
  return mesh;
}

test("a small instanced mesh's instances join the batch of its material with plain meshes, at the instance's world place", () => {
  const { scene, batcher } = setup();
  const metal = new THREE.MeshStandardMaterial({ color: "#888" });
  const street = poles(metal, 4, 100);
  scene.add(street, new THREE.Mesh(new THREE.BoxGeometry(), metal));
  scene.updateMatrixWorld();
  const batches = batchesOf(scene);
  expect(batches).toHaveLength(1);
  expect(batcher.stats()).toMatchObject({ batched: 2, single: 0, drawn: 1, shown: 5 });
  expect(street.layers.mask).toBe(1 << BATCHED_SOURCE_LAYER);
  const placed = Array.from({ length: 5 }, (_, index) => instanceMatrix(batches[0] as THREE.BatchedMesh, index)[0]);
  expect(placed).toContain(109);
  street.visible = false;
  scene.updateMatrixWorld();
  expect(batcher.stats().shown).toBe(1);
});

test("an instanced mesh whose instances move draws on its own until they hold still; large, coloured and per-instance-attribute ones keep their own draw", () => {
  const { scene, batcher } = setup();
  const metal = new THREE.MeshStandardMaterial();
  const moving = poles(metal, 3, 0);
  scene.add(moving);
  scene.updateMatrixWorld();
  expect(batcher.stats()).toMatchObject({ batched: 1 });
  moving.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 5, 0));
  moving.instanceMatrix.needsUpdate = true;
  scene.updateMatrixWorld();
  expect(moving.layers.mask).toBe(1);
  expect(batcher.stats()).toMatchObject({ batched: 0, single: 1, reasons: { instancesMoving: 1 } });
  for (let pass = 0; pass < 100; pass += 1) scene.updateMatrixWorld();
  expect(batcher.stats()).toMatchObject({ batched: 1, single: 0 });
  expect(moving.layers.mask).toBe(1 << BATCHED_SOURCE_LAYER);

  const field = poles(metal, 500, 0);
  const coloured = poles(metal, 2, 0);
  coloured.setColorAt(0, new THREE.Color("red"));
  const tagged = poles(metal, 2, 0);
  tagged.geometry.setAttribute("tint", new THREE.InstancedBufferAttribute(new Float32Array(2), 1));
  scene.add(field, coloured, tagged);
  scene.updateMatrixWorld();
  expect(batcher.stats().reasons).toMatchObject({ manyInstances: 1, instanceColor: 1, instanceAttribute: 1 });
  expect([field, coloured, tagged].every((mesh) => mesh.layers.mask === 1)).toBe(true);
});

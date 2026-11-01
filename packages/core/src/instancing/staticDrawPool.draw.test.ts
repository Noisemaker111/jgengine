import { expect, test } from "bun:test";
import * as THREE from "three";

import { POINTER_OBJECT_INSTANCES_KEY } from "@jgengine/core/input/pointerService.draw";
import { recordCompileLayer } from "@jgengine/core/material/compileLayers.draw";
import { applyWetness } from "@jgengine/core/material/wetSurfaces.draw";
import { applyModelSurface } from "@jgengine/core/model/modelSurface.draw";
import { applyModelWind, resolveModelWind } from "@jgengine/core/model/modelWind.draw";
import { batchableGeometry, geometryLayout, materialSignature, STATIC_POOL_MESH_KEY, StaticDrawPool } from "./staticDrawPool.draw";

function palette(color = "#c0a080"): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
}

function placements(count: number, x0 = 0): { instanceId: string; x: number }[] {
  return Array.from({ length: count }, (_, index) => ({ instanceId: `prop-${x0 + index}`, x: x0 + index * 2 }));
}

/** A glTF primitive has no draw groups; three's box has one per face. */
function box(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry();
  geometry.clearGroups();
  return geometry;
}

function cylinder(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry();
  geometry.clearGroups();
  return geometry;
}

const at = (member: { x: number }, out: THREE.Matrix4) => out.makeTranslation(member.x, 0, 0);

function pooledMeshes(scene: THREE.Object3D): THREE.BatchedMesh[] {
  return scene.children.filter((child): child is THREE.BatchedMesh => child instanceof THREE.BatchedMesh && child.userData[STATIC_POOL_MESH_KEY] === true);
}

test("materials that draw the same pixels share a signature; any drawn difference or unbatchable hook splits them", () => {
  const texture = new THREE.Texture();
  const a = palette();
  const b = palette();
  a.map = texture;
  b.map = texture.clone();
  expect(materialSignature(a)).not.toBeNull();
  expect(materialSignature(a)).toBe(materialSignature(b));
  expect(materialSignature(palette("#ff0000"))).not.toBe(materialSignature(palette()));
  b.map.offset.set(0.5, 0);
  expect(materialSignature(a)).not.toBe(materialSignature(b));

  const swaying = palette();
  swaying.onBeforeCompile = () => undefined;
  expect(materialSignature(swaying)).toBeNull();
  expect(materialSignature(new THREE.MeshStandardMaterial({ transparent: true }))).toBeNull();
  expect(materialSignature([palette(), palette()])).toBeNull();
});

test("the model surface pass batches: its materials still share a signature", () => {
  const root = new THREE.Group();
  const first = new THREE.Mesh(box(), palette());
  const second = new THREE.Mesh(new THREE.SphereGeometry(), palette());
  root.add(first, second);
  applyModelSurface(root);
  expect(first.material.onBeforeCompile).not.toBe(THREE.Material.prototype.onBeforeCompile);
  expect(materialSignature(first.material)).not.toBeNull();
  expect(materialSignature(first.material)).toBe(materialSignature(second.material));
});

test("a quantized geometry never shares buffers with a float one; a packed one is unpacked once", () => {
  const float = box();
  const quantized = new THREE.BufferGeometry();
  quantized.setAttribute("position", new THREE.BufferAttribute(new Int16Array(9), 3));
  quantized.setAttribute("normal", float.getAttribute("normal"));
  quantized.setAttribute("uv", float.getAttribute("uv"));
  quantized.setIndex(float.index);
  expect(geometryLayout(float)).not.toBe(geometryLayout(quantized));
  const packed = new THREE.InterleavedBuffer(new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 6);
  const interleaved = new THREE.BufferGeometry();
  interleaved.setAttribute("position", new THREE.InterleavedBufferAttribute(packed, 3, 0));
  interleaved.setAttribute("normal", new THREE.InterleavedBufferAttribute(packed, 3, 3));
  const flat = new THREE.BufferGeometry();
  flat.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
  flat.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(9), 3));
  expect(geometryLayout(interleaved)).toBe(geometryLayout(flat));
  const unpacked = batchableGeometry(interleaved);
  expect(batchableGeometry(interleaved)).toBe(unpacked);
  expect(Array.from(unpacked.getAttribute("position").array)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  expect(Array.from(unpacked.getAttribute("normal").array)).toEqual([0, 1, 0, 0, 1, 0, 0, 1, 0]);
});

test("different models cut from one material draw once per cell", () => {
  const scene = new THREE.Scene();
  const pool = new StaticDrawPool(scene);
  const crate = pool.acquire({ geometry: box(), material: palette() }, "0,0", 3);
  const barrel = pool.acquire({ geometry: cylinder(), material: palette() }, "0,0", 2);
  const far = pool.acquire({ geometry: box(), material: palette() }, "4,0", 1);
  expect(crate).not.toBeNull();
  expect(barrel?.mesh).toBe(crate?.mesh);
  expect(far?.mesh).not.toBe(crate?.mesh);
  expect(pool.batches()).toBe(2);
  expect(pooledMeshes(scene)).toHaveLength(2);
  const shadowed = pool.acquire({ geometry: box(), material: palette(), castShadow: true }, "0,0", 1);
  expect(shadowed?.mesh).not.toBe(crate?.mesh);
  pool.dispose();
});

test("a slot shows this frame's placements, hides the rest, and its batch leaves the draw when nothing shows", () => {
  const scene = new THREE.Scene();
  const pool = new StaticDrawPool(scene);
  const members = placements(3);
  const indexOf = new Map(members.map((member, index) => [member.instanceId, index]));
  const slot = pool.acquire({ geometry: box(), material: palette() }, "0,0", members.length);
  if (slot === null) throw new Error("expected a pooled slot");
  const mesh = slot.mesh;
  expect(mesh.visible).toBe(false);

  slot.sync(members, (member) => indexOf.get(member.instanceId), at);
  expect(mesh.visible).toBe(true);
  expect(pool.shownInstances()).toBe(3);
  const matrix = new THREE.Matrix4();
  const shownIds = () => [0, 1, 2].filter((instance) => mesh.getVisibleAt(instance));
  expect(shownIds()).toEqual([0, 1, 2]);
  expect(mesh.getMatrixAt(2, matrix).elements[12]).toBe(4);

  slot.sync(members.filter((_, index) => index !== 1), (member) => indexOf.get(member.instanceId), at);
  expect(shownIds()).toEqual([0, 2]);
  expect(mesh.getMatrixAt(2, matrix).elements[12]).toBe(4);

  slot.sync([], (member) => indexOf.get(member.instanceId), at);
  expect(mesh.visible).toBe(false);
  expect(pool.draws()).toBe(0);
  pool.dispose();
});

test("a moved placement record rewrites its instance; the same record writes nothing", () => {
  const scene = new THREE.Scene();
  const pool = new StaticDrawPool(scene);
  const slot = pool.acquire({ geometry: box(), material: palette() }, "0,0", 1);
  if (slot === null) throw new Error("expected a pooled slot");
  let writes = 0;
  const counting = (member: { x: number }, out: THREE.Matrix4) => {
    writes += 1;
    return at(member, out);
  };
  const first = { instanceId: "crate", x: 1 };
  slot.sync([first], () => 0, counting);
  slot.sync([first], () => 0, counting);
  expect(writes).toBe(1);
  slot.sync([{ instanceId: "crate", x: 7 }], () => 0, counting);
  expect(writes).toBe(2);
  expect(slot.mesh.getMatrixAt(0, new THREE.Matrix4()).elements[12]).toBe(7);
  pool.dispose();
});

test("picking a pooled prop names its placement", () => {
  const scene = new THREE.Scene();
  const pool = new StaticDrawPool(scene);
  const members = placements(2, 10);
  const indexOf = new Map(members.map((member, index) => [member.instanceId, index]));
  const slot = pool.acquire({ geometry: box(), material: palette() }, "0,0", 2);
  if (slot === null) throw new Error("expected a pooled slot");
  slot.sync(members, (member) => indexOf.get(member.instanceId), at);
  const raycaster = new THREE.Raycaster(new THREE.Vector3(12, 0, 10), new THREE.Vector3(0, 0, -1));
  const [hit] = raycaster.intersectObject(slot.mesh);
  expect(hit?.batchId).toBeDefined();
  const ids: unknown = slot.mesh.userData[POINTER_OBJECT_INSTANCES_KEY];
  expect(Array.isArray(ids) ? ids[hit?.batchId ?? -1] : null).toBe("prop-11");
  pool.dispose();
});

test("releasing slots frees instances and geometry, and the last one removes the batch", () => {
  const scene = new THREE.Scene();
  const pool = new StaticDrawPool(scene);
  const geometry = box();
  const first = pool.acquire({ geometry, material: palette() }, "0,0", 2);
  const second = pool.acquire({ geometry, material: palette() }, "0,0", 40);
  expect(first?.mesh.instanceCount).toBe(42);
  first?.release();
  expect(second?.mesh.instanceCount).toBe(40);
  expect(pooledMeshes(scene)).toHaveLength(1);
  second?.release();
  expect(pooledMeshes(scene)).toHaveLength(0);
  expect(pool.batches()).toBe(0);
});

test("a batch grows its shared buffers as models join it", () => {
  const scene = new THREE.Scene();
  const pool = new StaticDrawPool(scene);
  const slots = Array.from({ length: 6 }, (_, index) => pool.acquire({ geometry: new THREE.SphereGeometry(1, 32 + index, 16), material: palette() }, "0,0", 3));
  expect(new Set(slots.map((slot) => slot?.mesh)).size).toBe(1);
  expect(slots[5]?.mesh.instanceCount).toBe(18);
  pool.dispose();
});

test("scene-wide layers neither split a signature nor ride along on the batch's copy", () => {
  const plain = palette();
  const layered = palette();
  applyModelSurface(new THREE.Mesh(box(), plain));
  applyModelSurface(new THREE.Mesh(box(), layered));
  applyWetness(layered);
  const surfaceHook = layered.onBeforeCompile;
  const shadowHook: THREE.Material["onBeforeCompile"] = () => undefined;
  const wrapped = layered.onBeforeCompile;
  layered.onBeforeCompile = function (shader, renderer) {
    wrapped.call(this, shader, renderer);
    shadowHook.call(this, shader, renderer);
  };
  layered.defines = { ...layered.defines, USE_CSM: 1 };
  recordCompileLayer(layered, { hook: wrapped }, { defines: ["USE_CSM"] });
  expect(layered.onBeforeCompile).not.toBe(surfaceHook);
  expect(materialSignature(layered)).toBe(materialSignature(plain));

  const scene = new THREE.Scene();
  const pool = new StaticDrawPool(scene);
  const slot = pool.acquire({ geometry: box(), material: layered }, "0,0", 1);
  const copy = slot?.mesh.material;
  if (!(copy instanceof THREE.Material)) throw new Error("expected one material");
  expect(copy).not.toBe(layered);
  expect(copy.defines?.["USE_CSM"]).toBeUndefined();
  expect(copy.userData["jgWet"]).toBeUndefined();
  expect(copy.customProgramCacheKey()).toBe(plain.customProgramCacheKey());
  pool.dispose();
});

test("swaying foliage batches with foliage that sways alike, never with still or differently tuned leaves", () => {
  const leaves = () => {
    const material = palette();
    applyModelSurface(new THREE.Mesh(box(), material));
    return material;
  };
  const sway = (strength: number) => {
    const resolved = resolveModelWind({ strength }, 4);
    if (resolved === null) throw new Error("expected wind");
    return resolved;
  };
  const a = applyModelWind(leaves(), sway(0.2));
  const b = applyModelWind(leaves(), sway(0.2));
  const stronger = applyModelWind(leaves(), sway(0.5));
  expect(materialSignature(a)).not.toBeNull();
  expect(materialSignature(a)).toBe(materialSignature(b));
  expect(materialSignature(stronger)).not.toBe(materialSignature(a));
  expect(materialSignature(leaves())).not.toBe(materialSignature(a));
});

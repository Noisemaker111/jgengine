import { expect, test } from "bun:test";

import * as THREE from "three";

import { POINTER_OBJECT_INSTANCES_KEY } from "@jgengine/core/input/pointerService.draw";
import { acquireImpostorCardPool, ImpostorCardPool, releaseImpostorCardPool } from "./impostorCardPool.draw";

const makePool = () => new ImpostorCardPool(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial(), new THREE.MeshDepthMaterial());

function fill(slice: { matrices: Float32Array; ids: string[]; count: number }, ids: string[]) {
  ids.forEach((id, index) => {
    slice.matrices.set(new THREE.Matrix4().makeTranslation(index * 10, 0, 0).elements, index * 16);
    slice.ids[index] = id;
  });
  slice.count = ids.length;
}

test("every batch's far placements pack into one draw, ids in the same order", () => {
  const pool = makePool();
  fill(pool.slice(2), ["a", "b"]);
  fill(pool.slice(40), ["c"]);
  pool.pack(1);
  expect(pool.mesh.count).toBe(3);
  expect(pool.mesh.visible).toBe(true);
  expect(pool.mesh.userData[POINTER_OBJECT_INSTANCES_KEY]).toEqual(["a", "b", "c"]);
});

test("it packs once per frame, grows past its first capacity, and hides when empty", () => {
  const pool = makePool();
  const slice = pool.slice(40);
  fill(slice, Array.from({ length: 40 }, (_, index) => `o${index}`));
  pool.pack(1);
  expect(pool.mesh.count).toBe(40);
  slice.count = 0;
  pool.pack(1);
  expect(pool.mesh.count).toBe(40);
  pool.pack(2);
  expect(pool.mesh.count).toBe(0);
  expect(pool.mesh.visible).toBe(false);
});

test("the shared pool stays in the scene until its last user leaves", () => {
  const scene = new THREE.Scene();
  const first = acquireImpostorCardPool("tree", scene, makePool);
  const second = acquireImpostorCardPool("tree", scene, makePool);
  expect(second).toBe(first);
  releaseImpostorCardPool("tree", first);
  expect(first.mesh.parent).toBe(scene);
  releaseImpostorCardPool("tree", second);
  expect(first.mesh.parent).toBeNull();
});

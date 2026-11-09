import { expect, test } from "bun:test";
import * as THREE from "three";

import { DrawBatchMesh } from "./drawBatchMesh.draw";

interface Internals {
  _updateDrawParameters(camera: THREE.Camera, geometry: THREE.BufferGeometry, material: THREE.Material): void;
  _multiDrawCount: number;
  _multiDrawStarts: Int32Array;
  _multiDrawCounts: Int32Array;
  _indirectTexture: THREE.DataTexture;
}

/** A WebGL renderer as the shadow hook reads it. */
const GL = { isWebGPURenderer: false } as unknown as THREE.WebGLRenderer;

function internals(mesh: THREE.BatchedMesh): Internals {
  return mesh as unknown as Internals;
}

/** The list a batch would draw: its draw ranges in order and the instance each one reads. */
function drawList(mesh: THREE.BatchedMesh): string {
  const self = internals(mesh);
  const data = self._indirectTexture.image.data as Uint32Array;
  const parts: string[] = [];
  for (let index = 0; index < self._multiDrawCount; index += 1) parts.push(`${self._multiDrawStarts[index]}:${self._multiDrawCounts[index]}:${data[index]}`);
  return parts.join(" ");
}

function pair(material: THREE.Material) {
  const box = new THREE.BoxGeometry();
  const ball = new THREE.SphereGeometry(0.5, 8, 6);
  const ours = new DrawBatchMesh(4, 4096, 8192, material);
  const theirs = new THREE.BatchedMesh(4, 4096, 8192, material);
  for (const mesh of [ours, theirs]) {
    const ids = [mesh.addGeometry(box), mesh.addGeometry(ball)];
    for (let index = 0; index < 12; index += 1) {
      mesh.setInstanceCount(Math.max(mesh.maxInstanceCount, index + 1));
      const instance = mesh.addInstance(ids[index % 2] ?? 0);
      mesh.setMatrixAt(instance, new THREE.Matrix4().makeTranslation((index % 4) * 6 - 9, 0, -Math.floor(index / 4) * 8 - 5));
    }
  }
  return { ours, theirs, geometry: ours.geometry };
}

function camera(x: number, z: number, yaw: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 200);
  cam.position.set(x, 2, z);
  cam.rotation.y = yaw;
  cam.updateMatrixWorld();
  return cam;
}

test("every list the batch draws is the list three builds, over moves, visibility changes, cameras and shadow passes", () => {
  const material = new THREE.MeshStandardMaterial();
  const depth = new THREE.MeshDepthMaterial();
  const { ours, theirs } = pair(material);
  const cameras = [camera(0, 10, 0), camera(4, 6, 0.4), camera(-3, 12, -0.3)];
  const light = new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, 100);
  light.position.set(10, 30, 10);
  light.lookAt(0, 0, -10);
  light.updateMatrixWorld();
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let step = 0; step < 400; step += 1) {
    const roll = random();
    const instance = Math.floor(random() * 12);
    if (roll < 0.2) {
      const matrix = new THREE.Matrix4().makeTranslation(random() * 30 - 15, 0, -random() * 40);
      ours.setMatrixAt(instance, matrix);
      theirs.setMatrixAt(instance, matrix);
    } else if (roll < 0.3) {
      const visible = random() < 0.5;
      ours.setVisibleAt(instance, visible);
      theirs.setVisibleAt(instance, visible);
    }
    const view = cameras[Math.floor(random() * cameras.length)] ?? cameras[0]!;
    internals(ours)._updateDrawParameters(view, ours.geometry, material);
    internals(theirs)._updateDrawParameters(view, theirs.geometry, material);
    expect(drawList(ours)).toBe(drawList(theirs));
    if (random() < 0.3) {
      // A shadow pass draws unsorted: the same instances as three's, which a depth pass writes the same whatever the order.
      ours.onBeforeShadow(GL, ours, view, light, ours.geometry, depth, null as never);
      const sort = theirs.sortObjects;
      theirs.sortObjects = false;
      internals(theirs)._updateDrawParameters(light, theirs.geometry, depth);
      theirs.sortObjects = sort;
      expect(drawList(ours)).toBe(drawList(theirs));
    }
  }
});

test("a pass with the same camera and instances reuses the last list, and a list the GPU already holds is not uploaded again", () => {
  const material = new THREE.MeshStandardMaterial();
  const depth = new THREE.MeshDepthMaterial();
  const { ours } = pair(material);
  const view = camera(0, 10, 0);
  const light = new THREE.OrthographicCamera(-60, 60, 60, -60, 0.1, 200);
  light.position.set(0, 50, 0);
  light.lookAt(0, 0, 0);
  light.updateMatrixWorld();
  const run = () => internals(ours)._updateDrawParameters(view, ours.geometry, material);
  run();
  const texture = internals(ours)._indirectTexture;
  const { builds, uploads } = ours.counts;
  const version = texture.version;
  for (let pass = 0; pass < 5; pass += 1) run();
  expect(ours.counts).toEqual({ builds, uploads });
  expect(texture.version).toBe(version);
  // Every instance inside two shadow cascades: two builds of one unsorted list, uploaded at most once.
  ours.onBeforeShadow(GL, ours, view, light, ours.geometry, depth, null as never);
  const afterFirst = ours.counts.uploads;
  expect(afterFirst).toBeLessThanOrEqual(uploads + 1);
  const shifted = light.clone();
  shifted.position.x += 1;
  shifted.updateMatrixWorld();
  ours.onBeforeShadow(GL, ours, view, shifted, ours.geometry, depth, null as never);
  expect(ours.counts.builds).toBe(builds + 2);
  expect(ours.counts.uploads).toBe(afterFirst);
  ours.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, -6));
  run();
  expect(ours.counts.builds).toBe(builds + 3);
  expect(texture.version).toBeGreaterThan(version);
});

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import * as THREE from "three";

import { loadImportedScene, type ImportedScene, type ImportedSceneProgress } from "./importedScene.draw";
import { syntheticObj, syntheticPng, syntheticScene, type SyntheticScene } from "./testFixtures/syntheticScene";

setDefaultTimeout(120_000);

// The stated scale: 20,000 instances of 4,600 meshes under 1,500 textures, served over HTTP and parsed on real workers.
const SIZE = { instances: 20_000, meshes: 4_600, textures: 1_500 };
const scratch = resolve(import.meta.dir, "../../.scratch/scene-import-draw-test");
let generated: SyntheticScene;
let server: ReturnType<typeof Bun.serve>;
let imported: ImportedScene;
const progress: ImportedSceneProgress[] = [];
const texturesFetched = new Set<string>();

beforeAll(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(`${scratch}/meshes`, { recursive: true });
  await mkdir(`${scratch}/textures`, { recursive: true });
  generated = syntheticScene(SIZE);
  await Bun.write(`${scratch}/scene.json`, JSON.stringify(generated.scene));
  await Promise.all(generated.meshFiles.map((file, mesh) => Bun.write(`${scratch}/${file}`, syntheticObj(mesh))));
  await Promise.all(generated.textureFiles.map((file, texture) => Bun.write(`${scratch}/${file}`, syntheticPng(texture))));
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => new Response(Bun.file(`${scratch}${new URL(request.url).pathname}`)) });
  imported = await load({ onProgress: (step) => progress.push(step) });
});

function load(options: Parameters<typeof loadImportedScene>[1] = {}): Promise<ImportedScene> {
  return loadImportedScene(`http://127.0.0.1:${server.port}/scene.json`, {
    ...options,
    // No image decoder in Bun: the file the texture URL names must exist, and a 1x1 stands in for its
    // pixels. A browser queues image requests per host; 1,500 at once from Bun exhaust the local server.
    loadTexture: async (url) => {
      const { pathname } = new URL(url);
      if (!(await Bun.file(`${scratch}${pathname}`).exists())) throw new Error(`${url}: missing`);
      texturesFetched.add(pathname);
      return new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    },
  });
}

afterAll(async () => {
  imported?.dispose();
  await server?.stop(true);
  await rm(scratch, { recursive: true, force: true });
});

function batchedMeshes(scene = imported): THREE.BatchedMesh[] {
  const meshes: THREE.BatchedMesh[] = [];
  scene.root.traverse((node) => {
    if (node instanceof THREE.BatchedMesh) meshes.push(node);
  });
  return meshes;
}

describe("imported scene at 20,000 instances", () => {
  test("draws every instance in one batch per distinct mesh, from every file", () => {
    const { stats } = imported;
    expect(stats.instances).toBe(20_000);
    expect(stats.missingMeshes).toBe(0);
    expect(stats.meshFiles).toBe(4_600);
    expect(stats.batches).toBeGreaterThanOrEqual(4_600);
    expect(stats.batches).toBeLessThan(4_600 + generated.mirrored);
    expect(stats.textures).toBe(texturesFetched.size);
    expect(stats.bytes).toBeGreaterThan(0);
    // A two-part mesh draws each instance once per part, so its instances count twice.
    const parts = generated.scene.instances.reduce((sum, instance) => sum + instance.materials.length, 0);
    const shown = batchedMeshes().reduce((sum, mesh) => {
      let visible = 0;
      for (let instance = 0; instance < mesh.instanceCount; instance += 1) if (mesh.getVisibleAt(instance)) visible += 1;
      return sum + visible;
    }, 0);
    expect(shown).toBe(parts);
    // One shared multi-draw per material: far fewer GPU draws than distinct meshes.
    const materialsUsed = new Set(generated.scene.instances.flatMap((instance) => instance.materials)).size;
    expect(stats.draws).toBe(batchedMeshes().length);
    expect(stats.draws).toBe(materialsUsed);
    // Without a cell size each batch is one chunk per part: one per distinct mesh, winding and part.
    const batchParts = new Map<string, number>();
    for (const instance of generated.scene.instances) {
      const mirrored = new THREE.Matrix4().fromArray(instance.matrix).determinant() < 0;
      batchParts.set(`${instance.mesh}|${mirrored}`, instance.materials.length);
    }
    expect(stats.batches).toBe(batchParts.size);
    expect(stats.chunks).toBe([...batchParts.values()].reduce((sum, count) => sum + count, 0));
    const last = progress.at(-1)!;
    expect(last).toMatchObject({ meshFiles: 4_600, meshFilesLoaded: 4_600, instances: 20_000, instancesPlaced: 20_000, texturesLoaded: last.textures });
  });

  test("places each instance where the source tool drew it, X mirrored for the right-handed frame", () => {
    // Mesh 0's first OBJ vertex as written (X already negated by the exporter), and instance 0's Unity matrix.
    const written = syntheticObj(0).split("\n").find((line) => line.startsWith("v "))!.split(" ").slice(1).map(Number) as [number, number, number];
    const unity = new THREE.Matrix4().fromArray(generated.scene.instances[0]!.matrix);
    const unityWorld = new THREE.Vector3(-written[0], written[1], written[2]).applyMatrix4(unity);
    const expected = new THREE.Vector3(-unityWorld.x, unityWorld.y, unityWorld.z);
    const point = new THREE.Vector3();
    const instanceMatrix = new THREE.Matrix4();
    let nearest = Number.POSITIVE_INFINITY;
    for (const mesh of batchedMeshes()) {
      for (let instance = 0; instance < mesh.instanceCount; instance += 1) {
        mesh.getMatrixAt(instance, instanceMatrix);
        point.set(...written).applyMatrix4(instanceMatrix).applyMatrix4(mesh.matrixWorld);
        nearest = Math.min(nearest, point.distanceTo(expected));
      }
    }
    expect(nearest).toBeLessThan(1e-3);
  });

  test("with a cell size, splits into spatial cells a camera culls as units", async () => {
    const celled = await load({ cellSize: 512 });
    celled.root.updateMatrixWorld(true);
    const meshes = batchedMeshes(celled);
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 800);
    // Stand at one corner of the scene looking outward: most cells fall outside the frustum.
    const [cx, cz] = generated.scene.center;
    camera.position.set(-(cx - 2000), 50, cz - 2000);
    camera.lookAt(-(cx - 2600), 50, cz - 2600);
    camera.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const inView = meshes.filter((mesh) => frustum.intersectsSphere(mesh.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld))).length;
    expect(celled.stats.chunks).toBeGreaterThan(celled.stats.batches);
    expect(celled.stats.draws).toBeGreaterThan(imported.stats.draws);
    expect(meshes.every((mesh) => mesh.frustumCulled)).toBe(true);
    expect(inView).toBeLessThan(meshes.length / 4);
    celled.dispose();
  });

  test("dispose takes every draw out of the scene", () => {
    const scene = new THREE.Scene();
    scene.add(imported.root);
    imported.dispose();
    expect(imported.root.parent).toBeNull();
    expect(batchedMeshes().length).toBe(0);
  });
});

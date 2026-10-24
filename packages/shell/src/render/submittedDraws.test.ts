import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { createObjectStore } from "@jgengine/core/scene/objectStore";
import { createModelVariantSelector } from "@jgengine/core/world/modelLod";
import type { ScatterInstance } from "@jgengine/core/world/scatterRegion";
import { scatterBatchInstances, type ScatterBatch } from "../scatter/InstancedScatter";
import { buildScatterModelSources, disposeScatterModelSources } from "../scatter/scatterModels";
import { scatterVariantTriangles, writeScatterVariantLevel } from "../scatter/scatterVariants";
import { countStaticBatchDraws, groupStaticObjects, STATIC_BATCH_MESH_KEY, syncStaticObjectSource } from "../world/staticObjectBatches";
import { countSubmittedDraws, submitInstanceCount } from "./submittedDraws";

const FULL_TRIANGLES = 9134;
const FAR_TRIANGLES = 4110;
const BOUNDARY = 70;

const PALM: ModelConfig = {
  url: "mainsail-palm.glb",
  targetHeight: 7.6,
  anchor: "origin",
  variants: {
    levels: [
      { url: "mainsail-palm.glb", maxDistance: BOUNDARY },
      { url: "mainsail-palm-lod1.glb" },
    ],
  },
};

/** One-mesh GLB stand-in carrying exactly `triangles` triangles, so a drawn count is a real triangle count. */
function palmScene(triangles: number): THREE.Group {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 7.6, 0]), 3));
  const index = new Uint32Array(triangles * 3);
  for (let i = 0; i < index.length; i += 1) index[i] = i % 3;
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#3f6b32" })));
  return root;
}

/** Palms down one line at the given z offsets, all inside one 128 m cell. */
function palms(offsets: readonly number[]): ScatterBatch {
  const instances: ScatterInstance[] = offsets.map((z, index) => ({
    id: `harbor/palm/${index + 1}`,
    regionId: "harbor",
    item: "palm",
    x: 0,
    y: 0,
    z,
    rotationY: 0,
    scale: 1,
  }));
  const batches = scatterBatchInstances(instances, 128);
  expect(batches).toHaveLength(1);
  return batches[0]!;
}

/**
 * Mounts both levels' draws for one cell, exactly as `ScatterVariantSpecies` does, and runs the real
 * per-frame level pass. Returns the counts and the draws three actually submits.
 */
function drawCell(batch: ScatterBatch, cameraZ: number): { counts: number[]; submitted: number; triangles: number } {
  const selector = createModelVariantSelector(PALM.variants!);
  const camera = new THREE.Vector3(0, 0, cameraZ);
  const scene = new THREE.Scene();
  const counts: number[] = [];
  PALM.variants!.levels.forEach((level, index) => {
    const harvested = buildScatterModelSources(palmScene([FULL_TRIANGLES, FAR_TRIANGLES][index]!), {
      ...PALM,
      url: level.url,
      variants: undefined,
    });
    const source = harvested.sources[0]!;
    const slots = batch.matrices.map(() => new THREE.Matrix4());
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, batch.instances.length);
    scene.add(mesh);
    submitInstanceCount(mesh, writeScatterVariantLevel(index, selector, camera, batch.instances, batch.matrices, source.localMatrix, slots));
    counts.push(mesh.count);
    disposeScatterModelSources(harvested.root);
  });
  return { counts, submitted: countSubmittedDraws(scene), triangles: scatterVariantTriangles(counts, [FULL_TRIANGLES, FAR_TRIANGLES]) };
}

describe("a batch with no instances issues no draw", () => {
  test("a cell with palms only in the near band issues one draw, not two", () => {
    // Camera 50 m back: every palm sits 54..70 m out, inside the 70 m near band.
    const { counts, submitted, triangles } = drawCell(palms([4, 12, 20]), -50);

    expect(counts).toEqual([3, 0]);
    expect(submitted).toBe(1);
    expect(triangles).toBe(3 * FULL_TRIANGLES);
  });

  test("a cell where every palm is past the boundary issues only the far draw", () => {
    // Camera 50 m back: every palm sits 94 m out, past the boundary and its 6 m hysteresis edge.
    const { counts, submitted, triangles } = drawCell(palms([44, 52, 60]), -50);

    expect(counts).toEqual([0, 3]);
    expect(submitted).toBe(1);
    expect(triangles).toBe(3 * FAR_TRIANGLES);
  });

  test("a cell with palms on both sides of the boundary issues two draws", () => {
    // Camera 50 m back: 54 m and 66 m stay near, 94 m and 110 m go far.
    const { counts, submitted, triangles } = drawCell(palms([4, 16, 44, 60]), -50);

    expect(counts).toEqual([2, 2]);
    expect(submitted).toBe(2);
    expect(triangles).toBe(2 * FULL_TRIANGLES + 2 * FAR_TRIANGLES);
  });

  test("the static batch path submits the same one draw for a level that holds nothing", () => {
    const store = createObjectStore();
    store.place("obj_palm", 0, 0, 0, { instanceId: "near-a" });
    store.place("obj_palm", 0, 0, 10, { instanceId: "near-b" });
    const batch = groupStaticObjects(store.list().map((object) => ({ object, model: PALM, authored: true, custom: false, catalog: null }))).batches[0]!;
    const selector = createModelVariantSelector(PALM.variants!);
    const camera = new THREE.Vector3(0, 0, 0);
    const probe = new THREE.Vector3();
    const scratch = new THREE.Object3D();
    const scene = new THREE.Scene();
    PALM.variants!.levels.forEach((level, index) => {
      const harvested = buildScatterModelSources(palmScene([FULL_TRIANGLES, FAR_TRIANGLES][index]!), { ...PALM, url: level.url, variants: undefined });
      const source = harvested.sources[0]!;
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, batch.objects.length);
      mesh.userData[STATIC_BATCH_MESH_KEY] = true;
      scene.add(mesh);
      syncStaticObjectSource(mesh, source, batch.objects, store.get, () => true, scratch, (live) => {
        probe.set(live.position[0]!, live.position[1]!, live.position[2]!);
        return selector.level(live.instanceId, camera.distanceTo(probe)) === index;
      });
      disposeScatterModelSources(harvested.root);
    });

    expect(countStaticBatchDraws(scene)).toEqual({ draws: 1, drawn: 2 });
  });
});

import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { createObjectStore } from "@jgengine/core/scene/objectStore";
import { createModelVariantSelector } from "@jgengine/core/world/modelLod";
import { buildScatterModelSources, disposeScatterModelSources } from "../scatter/scatterModels";
import { countStaticBatchDraws, groupStaticObjects, STATIC_BATCH_MESH_KEY, syncStaticObjectSource, type StaticObjectBatch } from "./staticObjectBatches";
import { LevelSingles, VariantStaticObjects } from "./StaticObjectModels";

const FULL_TRIANGLES = 9134;
const FAR_TRIANGLES = 4110;

const PALM: ModelConfig = {
  url: "mainsail-palm.glb",
  targetHeight: 7.6,
  anchor: "origin",
  variants: {
    levels: [
      { url: "mainsail-palm.glb", maxDistance: 60 },
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

/** Draws one species through the level switch, the same compaction `VariantStaticObjects` runs each frame. */
function drawLevels(
  scene: THREE.Scene,
  batch: StaticObjectBatch,
  store: ReturnType<typeof createObjectStore>,
  model: ModelConfig,
  cameraPosition: THREE.Vector3,
  triangles: readonly number[],
): { count: number; triangles: number }[] {
  const selector = createModelVariantSelector(model.variants!);
  const scratch = new THREE.Object3D();
  const probe = new THREE.Vector3();
  const drawn: { count: number; triangles: number }[] = [];
  model.variants!.levels.forEach((level, index) => {
    const harvested = buildScatterModelSources(palmScene(triangles[index]!), { ...model, url: level.url, variants: undefined });
    expect(harvested.sources).toHaveLength(1);
    const source = harvested.sources[0]!;
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, batch.objects.length);
    mesh.userData[STATIC_BATCH_MESH_KEY] = true;
    scene.add(mesh);
    syncStaticObjectSource(mesh, source, batch.objects, store.get, () => true, scratch, (live) => {
      probe.set(live.position[0]!, live.position[1]!, live.position[2]!);
      return selector.level(live.instanceId, cameraPosition.distanceTo(probe)) === index;
    });
    drawn.push({ count: mesh.count, triangles: triangles[index]! });
    disposeScatterModelSources(harvested.root);
  });
  return drawn;
}

function palmBatch(store: ReturnType<typeof createObjectStore>, model: ModelConfig = PALM): StaticObjectBatch {
  return groupStaticObjects(store.list().map((object) => ({ object, model, authored: true, custom: false, catalog: null }))).batches[0]!;
}

describe("model variant batches", () => {
  test("the instanced renderer draws a variant model through the level switch", () => {
    expect(typeof VariantStaticObjects).toBe("function");
    expect(typeof LevelSingles).toBe("function");
  });

  test("one palm species at 20 m and 200 m draws full near, decimated far, and drops the expected triangles", () => {
    const store = createObjectStore();
    store.place("obj_palm", 0, 20, 0, { instanceId: "near" });
    store.place("obj_palm", 0, 200, 0, { instanceId: "far" });
    const batch = palmBatch(store);
    expect(batch.objects).toHaveLength(2);

    const scene = new THREE.Scene();
    const drawn = drawLevels(scene, batch, store, PALM, new THREE.Vector3(0, 0, 0), [FULL_TRIANGLES, FAR_TRIANGLES]);

    const meshes = scene.children as THREE.InstancedMesh[];
    expect(meshes[0]!.userData["jgStaticObjectPoses"]).toEqual([store.get("near")]);
    expect(meshes[1]!.userData["jgStaticObjectPoses"]).toEqual([store.get("far")]);

    expect(drawn).toEqual([{ count: 1, triangles: FULL_TRIANGLES }, { count: 1, triangles: FAR_TRIANGLES }]);
    const total = drawn[0]!.count * drawn[0]!.triangles + drawn[1]!.count * drawn[1]!.triangles;
    expect(total).toBe(FULL_TRIANGLES + FAR_TRIANGLES);
    expect(2 * FULL_TRIANGLES - total).toBe(5024);
    expect(countStaticBatchDraws(scene)).toEqual({ draws: 2, drawn: 2 });
  });

  test("the switch holds across the 60 m boundary instead of popping", () => {
    const selector = createModelVariantSelector(PALM.variants!);
    expect(selector.level("palm", 20)).toBe(0);
    for (const distance of [55, 59, 60, 61, 64, 65, 59, 57, 55]) expect(selector.level("palm", distance)).toBe(0);
    expect(selector.level("palm", 67)).toBe(1);
  });

  test("a batch whose instances all sit on one level submits one draw", () => {
    const store = createObjectStore();
    store.place("obj_palm", 0, 0, 0, { instanceId: "a" });
    store.place("obj_palm", 0, 0, 10, { instanceId: "b" });
    const batch = palmBatch(store);
    const scene = new THREE.Scene();
    drawLevels(scene, batch, store, PALM, new THREE.Vector3(0, 0, 0), [FULL_TRIANGLES, FAR_TRIANGLES]);
    const meshes = scene.children as THREE.InstancedMesh[];
    expect(meshes[0]!.count).toBe(2);
    expect(meshes[1]!.count).toBe(0);
    expect(meshes[1]!.visible).toBe(false);
  });

  test("fifteen palms in one cell keep the near ones full and the far ones cheap", () => {
    const store = createObjectStore();
    for (let i = 1; i <= 15; i += 1) store.place("obj_palm", 0, 0, i * 4, { instanceId: `palm-${i}` });
    const batch = palmBatch(store);
    expect(batch.objects).toHaveLength(15);
    const scene = new THREE.Scene();
    // Camera 50 m back: palm at z=4 is 54 m away, z=60 is 110 m, so two stay full and thirteen go cheap.
    const drawn = drawLevels(scene, batch, store, PALM, new THREE.Vector3(0, 0, -50), [FULL_TRIANGLES, FAR_TRIANGLES]);
    expect(drawn.map((level) => level.count)).toEqual([2, 13]);
    const total = drawn[0]!.count * FULL_TRIANGLES + drawn[1]!.count * FAR_TRIANGLES;
    expect(total).toBe(71698);
    expect(15 * FULL_TRIANGLES - total).toBe(65312);
    expect(countStaticBatchDraws(scene)).toEqual({ draws: 2, drawn: 15 });
  });
});

import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { createEmptyEditorDocument } from "@jgengine/core/editor/index";
import { createObjectStore, type SceneObject } from "@jgengine/core/scene/objectStore";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { placeAuthoredObjects, resolveAuthoredObjects } from "@jgengine/core/world/authoredObjects";
import { buildScatterModelSources, disposeScatterModelSources } from "../scatter/scatterModels";
import { createPointerService, POINTER_OBJECT_INSTANCES_KEY } from "../pointer/pointerService";
import { measureLocalBounds } from "../render/measureBounds";
import { measureLocalCollisionTriangles } from "../render/measureCollisionMesh";
import { resolveObjectModel, type ObjectModelCacheEntry } from "../render/resolveModel";
import { canBatchStaticObject, canInstanceStaticScene, groupStaticObjects, incompatibleStaticObjectIds, syncStaticObjectSource, type StaticObjectCandidate } from "./staticObjectBatches";

function candidate(index: number, patch: Partial<StaticObjectCandidate> = {}): StaticObjectCandidate {
  return {
    object: { instanceId: `prop-${index}`, catalogId: "model-a", position: [index % 8, 1, 2], rotationY: index / 10 },
    model: { url: "model-a.glb", animation: "auto" }, authored: true, custom: false, catalog: null, ...patch,
  };
}

function modelScene() {
  const root = new THREE.Group();
  const nested = new THREE.Group();
  nested.position.set(1, 2, -3);
  nested.rotation.set(0.2, 0.3, 0.1);
  nested.scale.set(2, 1, 0.5);
  const geometry = new THREE.BoxGeometry(2, 4, 1);
  geometry.clearGroups();
  geometry.addGroup(0, 18, 0);
  geometry.addGroup(18, 18, 1);
  const mesh = new THREE.Mesh(geometry, [new THREE.MeshStandardMaterial({ color: "#ab4422" }), new THREE.MeshStandardMaterial({ color: "#2266ac" })]);
  nested.add(mesh);
  const second = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: "#229944" }));
  second.position.set(-2, 0.5, 1);
  root.add(nested, second);
  return { root, mesh };
}

describe("static authored object batching", () => {
  test("requires more than eight compatible placements in a cell and preserves model choices", () => {
    const eight = Array.from({ length: 8 }, (_, i) => candidate(i));
    expect(groupStaticObjects(eight).batches).toHaveLength(0);
    const objects = [...eight, candidate(8), ...Array.from({ length: 9 }, (_, i) => candidate(i + 9, { model: { url: "model-a.glb", material: { color: "red" } } }))];
    const grouped = groupStaticObjects(objects);
    expect(grouped.batches).toHaveLength(2);
    expect(grouped.batches.map((batch) => batch.objects.length)).toEqual([9, 9]);
    expect(grouped.batches[1]!.model.material?.color).toBe("red");
    const outside = candidate(30); outside.object.position = [24, 1, 2];
    expect(groupStaticObjects([...eight, outside]).batches).toHaveLength(0);
  });

  test("keeps custom, runtime, interactive, animated, textured, composed and mirrored placements independent", () => {
    const excluded: Partial<StaticObjectCandidate>[] = [
      { authored: false }, { custom: true }, { catalog: { verbs: [{} as never] } },
      { catalog: { proximityPrompt: {} as never } }, { catalog: { breakable: { baseBreakTime: 1 } } },
      { catalog: { slotInventory: {} as never } }, { model: { url: "a", animation: { clip: "spin" } } },
      { model: { url: "a", ik: "auto" } }, { model: { url: "a", parts: [{ model: "b" }] } },
      { model: { url: "a", attachments: [{ model: "b", slot: "hand" }] } },
      { model: { url: "a", material: { maps: { color: "a.png" } } } }, { model: { url: "a", scale: -1 } },
      { model: { url: "a", materialAssignments: [{ materialId: "cloth", selector: { slot: "Shirt" } }] } },
      { object: { ...candidate(0).object, state: { locked: true } } },
      { style: { hidden: true } }, { style: { color: "red", opacity: 0.4 } },
      { object: { ...candidate(0).object, visual: { scale: [2, 3, 0.5] } } },
      { object: { ...candidate(0).object, visual: { color: "blue", opacity: 0.7 } } },
    ];
    for (const patch of excluded) expect(groupStaticObjects(Array.from({ length: 10 }, (_, i) => candidate(i, patch))).batches).toHaveLength(0);
  });

  test("reuses unchanged batch/model identities and falls back when live compatibility changes", () => {
    const store = createObjectStore();
    for (let i = 0; i < 10; i++) store.place("a", i, 0, 0, { instanceId: `a-${i}` });
    const candidates = () => store.list().map((object) => candidate(0, { object, model: { url: "a.glb" } }));
    const first = groupStaticObjects(candidates()).batches[0]!;
    const cache = new Map([[first.key, first]]);
    const rerender = groupStaticObjects(candidates(), 24, cache).batches[0]!;
    expect(rerender).toBe(first); expect(rerender.model).toBe(first.model);
    let excluded: readonly string[] = [];
    expect(incompatibleStaticObjectIds(first, store.get, () => null, excluded)).toBe(excluded);
    store.move("a-0", 3, 1, 4); store.rotate("a-0", 0.5);
    expect(incompatibleStaticObjectIds(first, store.get, () => null, excluded)).toBe(excluded);
    store.setVisual("a-0", { scale: [2, 3, 0.5] });
    excluded = incompatibleStaticObjectIds(first, store.get, () => null, excluded);
    expect(excluded).toEqual(["a-0"]);
    expect(canBatchStaticObject(candidate(0, { object: store.get("a-0")! }))).toBe(false);
    expect(incompatibleStaticObjectIds(first, store.get, () => null, excluded)).toBe(excluded);
    store.setVisual("a-0", undefined); store.setState("a-1", { open: true });
    excluded = incompatibleStaticObjectIds(first, store.get, () => null, excluded);
    expect(excluded).toEqual(["a-1"]);
    store.setState("a-1", undefined);
    expect(incompatibleStaticObjectIds(first, store.get, () => ({ verbs: [{} as never] }), excluded)).toHaveLength(10);
    expect(incompatibleStaticObjectIds(first, store.get, () => null, excluded)).toEqual([]);
    expect(groupStaticObjects(candidates().map((entry) => ({ ...entry, style: { hidden: true } })), 24, cache).batches).toHaveLength(0);
  });

  test("loaded model safety rejects animations, skeletons, morphs, transparency, custom draws and negative transforms", () => {
    const { root, mesh } = modelScene();
    expect(canInstanceStaticScene(root, [])).toBe(true);
    mesh.rotation.y = 0.7;
    expect(canInstanceStaticScene(root, [])).toBe(false);
    mesh.rotation.y = 0;
    expect(canInstanceStaticScene(root, [new THREE.AnimationClip("spin", 1, [])])).toBe(false);
    mesh.scale.x = -1;
    expect(canInstanceStaticScene(root, [])).toBe(false);
    mesh.scale.x = 1;
    mesh.morphTargetInfluences = [0];
    expect(canInstanceStaticScene(root, [])).toBe(false);
    delete mesh.morphTargetInfluences;
    (mesh.material as THREE.Material[])[0]!.transparent = true;
    expect(canInstanceStaticScene(root, [])).toBe(false);
    (mesh.material as THREE.Material[])[0]!.transparent = false;
    mesh.onBeforeRender = () => {};
    expect(canInstanceStaticScene(root, [])).toBe(false);
    root.add(new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    expect(canInstanceStaticScene(root, [])).toBe(false);
  });

  test("fallback resolves a supplied live catalog and animation instead of the original parent's model", () => {
    const assets = createAssetCatalog();
    assets.register("static", { url: "static.glb" });
    assets.register("animated", { url: "animated.glb", clips: ["open"] });
    const cache = new Map<string, ObjectModelCacheEntry>();
    const original = candidate(0).object;
    original.catalogId = "static";
    const originalModel = resolveObjectModel(original, undefined, assets, cache)!;
    const live = { ...original, catalogId: "animated", animation: { clip: "open", speed: 0.5 } };
    const fallback = resolveObjectModel(live, undefined, assets, cache)!;
    expect(fallback.url).toBe("animated.glb"); expect(fallback.animation).toEqual(live.animation);
    expect(originalModel.url).toBe("static.glb"); expect(originalModel.animation).toBe("auto");
    expect(resolveObjectModel(original, undefined, assets, cache)).toBe(originalModel);
    const disabled = resolveObjectModel({ ...live, animation: "none" }, undefined, assets, cache)!;
    expect(disabled.url).toBe("animated.glb"); expect(disabled.animation).toBe("none");
    const remapped = resolveObjectModel(live, { animated: { url: "chosen.glb", scale: 1.5 } }, assets, cache)!;
    expect(remapped.url).toBe("chosen.glb"); expect(remapped.scale).toBe(1.5); expect(remapped.animation).toEqual(live.animation);
    assets.register("static", { url: "reimported.glb" });
    expect(resolveObjectModel(original, undefined, assets, cache)?.url).toBe("reimported.glb");
    const store = createObjectStore();
    for (let i = 0; i < 10; i++) store.place("static", i, 0, 0, { instanceId: `p-${i}` });
    const batch = groupStaticObjects(store.list().map((object) => candidate(0, { object, model: originalModel }))).batches[0]!;
    const fallbackObjects = new Map<string, SceneObject>();
    store.place("animated", 0, 0, 0, { instanceId: "p-0", animation: { clip: "open" }, onExisting: "replace" });
    const excluded = incompatibleStaticObjectIds(batch, store.get, () => null, [], fallbackObjects);
    expect(resolveObjectModel(store.get(excluded[0]!)!, undefined, assets, cache)?.animation).toEqual({ clip: "open" });
    store.place("animated", 0, 0, 0, { instanceId: "p-0", animation: { clip: "close" }, onExisting: "replace" });
    const changed = incompatibleStaticObjectIds(batch, store.get, () => null, excluded, fallbackObjects);
    expect(changed).not.toBe(excluded); expect(changed).toEqual(excluded);
    expect(resolveObjectModel(store.get(changed[0]!)!, undefined, assets, cache)?.animation).toEqual({ clip: "close" });
    store.move("p-0", 3, 0, 4);
    expect(incompatibleStaticObjectIds(batch, store.get, () => null, changed, fallbackObjects)).toBe(changed);
  });

  test("compacts visibility, follows live yaw/position/removal, and retains object picking and transformed normals", () => {
    const store = createObjectStore();
    store.place("a", -4, 0, 0, { instanceId: "hidden" });
    store.place("a", 0, 0, 0, { instanceId: "visible", rotation: 0.4 });
    const objects = store.list();
    const geometry = new THREE.BoxGeometry();
    const source = { geometry, material: new THREE.MeshStandardMaterial(), localMatrix: new THREE.Matrix4(), castShadow: true, receiveShadow: true };
    const mesh = new THREE.InstancedMesh(geometry, source.material, 2);
    const scratch = new THREE.Object3D();
    syncStaticObjectSource(mesh, source, objects, store.get, (id) => id !== "hidden", scratch);
    expect(mesh.count).toBe(1);
    expect(mesh.userData[POINTER_OBJECT_INSTANCES_KEY]).toEqual(["visible"]);
    const version = mesh.instanceMatrix.version;
    let matrixWrites = 0;
    const setMatrixAt = mesh.setMatrixAt.bind(mesh);
    mesh.setMatrixAt = (index, matrix) => { matrixWrites++; setMatrixAt(index, matrix); };
    syncStaticObjectSource(mesh, source, objects, store.get, (id) => id !== "hidden", scratch);
    expect(mesh.instanceMatrix.version).toBe(version); expect(matrixWrites).toBe(0);
    const scene = new THREE.Scene(); scene.add(mesh); scene.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100); camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const pointer = createPointerService(); pointer.bind({ scene, camera, width: 500, height: 500 });
    const hit = pointer.worldHitCenter();
    expect(hit?.object).toBe("visible"); expect(hit?.instanceId).toBe(0);
    expect(hit?.normal[0]).toBeCloseTo(Math.sin(0.4), 5);
    expect(hit?.normal[2]).toBeCloseTo(Math.cos(0.4), 5);
    store.move("visible", 3, 2, -5); store.rotate("visible", 1.2);
    syncStaticObjectSource(mesh, source, objects, store.get, () => true, scratch);
    const actual = new THREE.Matrix4(); mesh.getMatrixAt(1, actual);
    const expected = new THREE.Matrix4().makeRotationY(1.2).setPosition(3, 2, -5);
    actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index]!, 5));
    store.remove("visible"); store.remove("hidden");
    syncStaticObjectSource(mesh, source, objects, store.get, () => true, scratch);
    expect(mesh.count).toBe(0); expect(mesh.visible).toBe(false); expect(mesh.userData[POINTER_OBJECT_INSTANCES_KEY]).toEqual([]);
  });

  test("preserves normalized nested multi-material sources, shadows, measured colliders and cache ownership", () => {
    const { root, mesh } = modelScene();
    const model = { url: "chosen.glb", scale: 1.3, targetHeight: 5, y: 0.2, shadows: "receive" as const, material: { roughness: 0.9 } };
    const harvested = buildScatterModelSources(root, model);
    expect(harvested.sources).toHaveLength(2);
    expect(harvested.sources[0]!.geometry).toBe(mesh.geometry);
    expect(harvested.sources[0]!.material).toHaveLength(2);
    expect(harvested.sources.every((source) => !source.castShadow && source.receiveShadow)).toBe(true);
    const normalized = new THREE.Group();
    for (const source of harvested.sources) {
      const child = new THREE.Mesh(source.geometry, source.material); child.matrixAutoUpdate = false; child.matrix.copy(source.localMatrix); normalized.add(child);
    }
    const bounds = measureLocalBounds(normalized)!;
    expect(bounds.max[1] - bounds.min[1]).toBeCloseTo(6.5, 5); expect(bounds.min[1]).toBeCloseTo(0.2, 5);
    expect(measureLocalCollisionTriangles(normalized)?.meshCount).toBe(2);
    const materials = harvested.sources.flatMap((source) => Array.isArray(source.material) ? source.material : [source.material]);
    let disposed = 0; for (const material of materials) material.addEventListener("dispose", () => disposed++);
    let cacheDisposed = 0; mesh.geometry.addEventListener("dispose", () => cacheDisposed++);
    for (const material of mesh.material as THREE.Material[]) material.addEventListener("dispose", () => cacheDisposed++);
    disposeScatterModelSources(harvested.root);
    expect(disposed).toBe(3); expect(cacheDisposed).toBe(0);
  });

  test("exact authored fixture: 24 distinct models, 3072 placements, 9216 independent submissions become 144", () => {
    const document = createEmptyEditorDocument();
    const configs = new Map(Array.from({ length: 24 }, (_, i) => [`asset-${i}`, { url: `authored-${i}.glb`, material: { color: `#${(0x334455 + i * 900).toString(16)}` } }] as const));
    for (const [catalogId] of configs) for (let cell = 0; cell < 2; cell++) for (let i = 0; i < 64; i++) {
      document.markers.push({ id: `${catalogId}:${cell}:${i}`, kind: "prop", catalogId, position: { x: cell * 24 + i % 8, y: 0, z: Math.floor(i / 8) }, rotationY: i / 10 });
    }
    const saved = JSON.stringify(document);
    const store = createObjectStore(); placeAuthoredObjects(store, resolveAuthoredObjects(document), (x, z) => x / 10 + z / 20);
    const grouped = groupStaticObjects(store.list().map((object) => ({ object, model: configs.get(object.catalogId)!, authored: true, custom: false, catalog: null })));
    expect(grouped.singles).toHaveLength(0); expect(grouped.batches).toHaveLength(48);
    expect(new Set(grouped.batches.map((batch) => batch.model.url)).size).toBe(24);
    let submissions = 0;
    for (const batch of grouped.batches) {
      const { root } = modelScene(); const harvested = buildScatterModelSources(root, batch.model);
      for (const source of harvested.sources) {
        submissions += Array.isArray(source.material) ? source.geometry.groups.filter((group) => source.material instanceof Array && source.material[group.materialIndex ?? 0]?.visible).length : 1;
        const mesh = new THREE.InstancedMesh(source.geometry, source.material, batch.objects.length);
        syncStaticObjectSource(mesh, source, batch.objects, store.get, () => true, new THREE.Object3D());
        expect(mesh.count).toBe(64);
        const matrix = new THREE.Matrix4(); mesh.getMatrixAt(63, matrix);
        const placed = batch.objects[63]!;
        const expected = new THREE.Matrix4().makeRotationY(placed.rotationY).setPosition(...placed.position).multiply(source.localMatrix);
        matrix.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index]!, 4));
        mesh.dispose();
      }
      disposeScatterModelSources(harvested.root);
    }
    expect(store.list().length * 3).toBe(9216); expect(submissions).toBe(144);
    expect(JSON.stringify(document)).toBe(saved);
  });
});

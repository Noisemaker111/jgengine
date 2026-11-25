// @skill jgengine-world
import * as THREE from "three";

import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { partitionInstances } from "@jgengine/core/instancing/instanceChunks.draw";
import { uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { staticDrawPoolFor, type PooledPlacement, type StaticDrawSlot } from "@jgengine/core/instancing/staticDrawPool.draw";
import { staticPoolCellAt } from "@jgengine/core/instancing/staticObjectBatches.draw";
import { ImageTextureLoader } from "@jgengine/core/material/imageTexture.draw";
import { sharedModelLoadingManager, trackSceneWork } from "@jgengine/core/model/modelLoad.draw";
import { freezeStaticTransforms } from "@jgengine/core/model/staticTransforms.draw";
import { nextFrame } from "@jgengine/core/run/nextFrame.view";
import { SLICE_BUDGET_MS } from "@jgengine/core/run/slicedWork";
import { createWorkerPool, defaultWorkerCount, type WorkerPool } from "@jgengine/core/run/workerPool";
import { parseImportedSceneFile, planImportedScene, type ImportedBatchPlan } from "./importedScene";
import { fetchObjFile, isObjFileResult, type ObjFileJob, type ObjFileResult } from "./objFile";
import { findObjObject, type ObjSubmesh } from "./objMesh";

/** How far a load has got; every count only grows. */
export interface ImportedSceneProgress {
  meshFiles: number;
  meshFilesLoaded: number;
  textures: number;
  texturesLoaded: number;
  instances: number;
  instancesPlaced: number;
  /** OBJ bytes fetched so far. */
  bytes: number;
}

/** What a finished import holds. */
export interface ImportedSceneStats {
  /** Instances drawn. */
  instances: number;
  /** Instances outside the scene radius, left out. */
  skipped: number;
  /** OBJ files fetched. */
  meshFiles: number;
  /** Instances whose OBJ file or object could not be loaded. */
  missingMeshes: number;
  /** Distinct textures loaded. */
  textures: number;
  /** Materials drawn in a flat colour because their texture is missing or failed. */
  flatMaterials: number;
  /** One per distinct mesh, material list and winding: the instanced batches. */
  batches: number;
  /** Spatial cells those batches split into, each culled as a unit. */
  chunks: number;
  /** GPU draws all of it takes before culling: shared multi-draw batches plus instanced fallbacks. */
  draws: number;
  /** OBJ bytes fetched. */
  bytes: number;
  /** Wall time from the call to the last batch placed. */
  loadMs: number;
}

/** A loaded scene folder. */
export interface ImportedScene {
  /** Add to a scene; it sits at the scene's centre and its draws are frozen in place under it. */
  root: THREE.Group;
  stats: ImportedSceneStats;
  /** Remove every draw and free its buffers, materials and textures. */
  dispose(): void;
}

/** Options for {@link loadImportedScene}. */
export interface LoadImportedSceneOptions {
  onProgress?: (progress: ImportedSceneProgress) => void;
  /** Added under this node before the first batch, so batches appear as they land. */
  parent?: THREE.Object3D;
  /** Uploads each texture inside the frame budget instead of in the first frame that draws it. */
  renderer?: THREE.WebGLRenderer;
  /**
   * Edge in metres of the spatial cells batches split into; each cell's draws cull as one. Default
   * one cell for the whole scene: a draw is one texture in one cell, so with many textures spread
   * over the scene, cells multiply draws faster than culling saves (see the package README).
   */
  cellSize?: number;
  /** Main-thread work per frame while building, in ms. Default the engine's slice budget. */
  budgetMs?: number;
  /** Hands the frame back between build slices. Default the next animation frame. */
  yieldThread?: () => Promise<void>;
  /** OBJ parsing workers. Default one less than the cores, at most 6. */
  workers?: number;
  /** Start one OBJ worker; default spawns `objMeshWorker.ts` as a module worker. */
  spawn?: () => Worker;
  /** Loads one texture; default the engine's image loader on the model loading manager. */
  loadTexture?: (url: string) => Promise<THREE.Texture>;
  /** Fetches `scene.json` (and OBJ files where there are no workers). */
  fetch?: typeof fetch;
}

function spawnObjWorker(): Worker {
  return new Worker(new URL("./objMeshWorker.ts", import.meta.url), { type: "module" });
}

function defaultTextureLoad(url: string): Promise<THREE.Texture> {
  const loader = new ImageTextureLoader(sharedModelLoadingManager());
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

/** A steady colour per material name, so untextured parts still read apart. */
function flatColor(name: string): THREE.Color {
  let hash = 2166136261;
  for (let index = 0; index < name.length; index += 1) hash = Math.imul(hash ^ name.charCodeAt(index), 16777619);
  return new THREE.Color().setHSL(((hash >>> 0) % 360) / 360, 0.25, 0.6);
}

function submeshGeometry(submesh: ObjSubmesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(submesh.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(submesh.normals, 3));
  if (submesh.uvs !== null) geometry.setAttribute("uv", new THREE.BufferAttribute(submesh.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(submesh.indices, 1));
  // Measured on the worker; a batch reads these instead of walking the vertices again.
  const [minX, minY, minZ, maxX, maxY, maxZ] = submesh.bounds;
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  return geometry;
}

/** The same triangles wound the other way, for placements whose matrix mirrors them. */
function rewound(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const copy = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) copy.setAttribute(name, attribute);
  const source = geometry.index!.array;
  const indices = new Uint32Array(source.length);
  for (let face = 0; face < source.length; face += 3) {
    indices[face] = source[face]!;
    indices[face + 1] = source[face + 2]!;
    indices[face + 2] = source[face + 1]!;
  }
  copy.setIndex(new THREE.BufferAttribute(indices, 1));
  copy.boundingBox = geometry.boundingBox?.clone() ?? null;
  copy.boundingSphere = geometry.boundingSphere?.clone() ?? null;
  return copy;
}

interface ImportPlacement extends PooledPlacement {
  readonly index: number;
  readonly matrix: THREE.Matrix4;
}

const slotOf = (member: ImportPlacement): number => member.index;
const matrixOf = (member: ImportPlacement, out: THREE.Matrix4): THREE.Matrix4 => out.copy(member.matrix);

/**
 * Load an interchange scene folder (`scene.json`, `meshes/*.obj`, `textures/*.png`) as instanced
 * batches: one batch per distinct mesh, split into spatial cells that cull as units, drawn through the
 * engine's shared static batches so a cell's meshes that share a texture take one multi-draw. OBJ files
 * are fetched and parsed on workers and textures decode off the main thread; the main thread only
 * places what arrived, a few milliseconds a frame, so the renderer keeps drawing while it loads.
 * @capability scene-import load a folder of OBJ meshes, PNG textures and a placement file as instanced, culled batches
 */
export async function loadImportedScene(sceneUrl: string, options: LoadImportedSceneOptions = {}): Promise<ImportedScene> {
  const started = performance.now();
  const doneWork = trackSceneWork(`scene-import:${sceneUrl}`);
  const fetchImpl = options.fetch ?? fetch;
  const base = typeof location === "undefined" ? undefined : location.href;
  const sceneHref = new URL(resolveAssetBaseUrl(sceneUrl), base).href;
  const at = (path: string) => new URL(path, sceneHref).href;
  const root = new THREE.Group();
  root.name = `imported:${sceneUrl}`;
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials = new Map<string, Promise<THREE.MeshStandardMaterial>>();
  const textures = new Map<string, Promise<THREE.Texture | null>>();
  const fallbacks: THREE.InstancedMesh[] = [];
  const slots: StaticDrawSlot[] = [];
  const pool = staticDrawPoolFor(root);
  let workers: WorkerPool<ObjFileJob, ObjFileResult> | null = null;
  const dispose = () => {
    workers?.reset();
    for (const slot of slots.splice(0)) slot.release();
    pool.dispose();
    for (const mesh of fallbacks.splice(0)) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    for (const geometry of geometries.values()) geometry.dispose();
    geometries.clear();
    for (const material of materials.values()) void material.then((built) => built.dispose());
    for (const texture of textures.values()) void texture.then((loaded) => loaded?.dispose());
    root.removeFromParent();
  };
  try {
    const response = await fetchImpl(sceneHref);
    if (!response.ok) throw new Error(`${sceneHref}: HTTP ${response.status}`);
    const file = parseImportedSceneFile(await response.json());
    const plan = planImportedScene(file);
    root.position.set(plan.origin[0], plan.origin[1], plan.origin[2]);
    if (options.parent !== undefined) options.parent.add(root);
    root.updateWorldMatrix(true, false);

    const progress: ImportedSceneProgress = {
      meshFiles: plan.meshFiles.length, meshFilesLoaded: 0, textures: plan.textures.length, texturesLoaded: 0,
      instances: plan.instances, instancesPlaced: 0, bytes: 0,
    };
    const report = () => options.onProgress?.({ ...progress });
    const stats = { missingMeshes: 0, flatMaterials: 0, chunks: 0 };
    const loadTexture = options.loadTexture ?? defaultTextureLoad;
    const budgetMs = options.budgetMs ?? SLICE_BUDGET_MS;
    // Without a cell size every batch is one chunk in one shared cell.
    const cellSize = options.cellSize ?? Number.MAX_VALUE;
    // The scene's centre sits in the middle of a cell, so a cell as wide as the scene draws it as one.
    const gridOrigin = [-cellSize / 2, -cellSize / 2] as const;
    const cellAt = (x: number, z: number) => options.cellSize === undefined ? "scene" : staticPoolCellAt(x - gridOrigin[0], z - gridOrigin[1], cellSize);
    const yieldThread = options.yieldThread ?? nextFrame;

    // Main-thread work waits here and runs a few milliseconds a frame.
    const tasks: (() => void)[] = [];
    let wake: (() => void) | null = null;
    // OBJ files and started textures still loading; the build loop runs until both they and the tasks are done.
    let pending = plan.meshFiles.length;
    const enqueue = (task: () => void) => {
      tasks.push(task);
      wake?.();
    };

    const textureFor = (path: string): Promise<THREE.Texture | null> => {
      let loading = textures.get(path);
      if (loading === undefined) {
        pending += 1;
        loading = loadTexture(at(path)).then(
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.needsUpdate = true;
            if (options.renderer !== undefined) enqueue(() => options.renderer!.initTexture(texture));
            return texture;
          },
          (error: unknown) => {
            console.warn(`[jgengine] scene import: texture ${path} failed, drawing a flat colour`, error);
            return null;
          },
        ).finally(() => {
          progress.texturesLoaded += 1;
          pending -= 1;
          report();
          wake?.();
        });
        textures.set(path, loading);
      }
      return loading;
    };
    const materialFor = (name: string): Promise<THREE.MeshStandardMaterial> => {
      let built = materials.get(name);
      if (built === undefined) {
        const path = file.materials[name]?.texture;
        built = (path === undefined ? Promise.resolve(null) : textureFor(path)).then((map) => {
          if (map === null) stats.flatMaterials += 1;
          const material = new THREE.MeshStandardMaterial(map === null ? { color: flatColor(name), roughness: 0.85, metalness: 0 } : { map, roughness: 0.85, metalness: 0 });
          material.name = name;
          return material;
        });
        materials.set(name, built);
      }
      return built;
    };
    const geometryFor = (key: string, submesh: ObjSubmesh, mirrored: boolean): THREE.BufferGeometry => {
      const plainKey = `${key}|plain`;
      let plain = geometries.get(plainKey);
      if (plain === undefined) {
        plain = submeshGeometry(submesh);
        geometries.set(plainKey, plain);
      }
      if (!mirrored) return plain;
      let flipped = geometries.get(`${key}|mirrored`);
      if (flipped === undefined) {
        flipped = rewound(plain);
        geometries.set(`${key}|mirrored`, flipped);
      }
      return flipped;
    };

    const placeBatch = (batch: ImportedBatchPlan, parsed: ObjFileResult, built: readonly THREE.MeshStandardMaterial[]) => {
      const object = findObjObject(parsed.objects, batch.meshName);
      if (object === null) {
        stats.missingMeshes += batch.count;
        console.warn(`[jgengine] scene import: ${batch.mesh} has no object "${batch.meshName}"`);
        return;
      }
      const matrices = Array.from({ length: batch.count }, (_, index) => new THREE.Matrix4().fromArray(batch.matrices, index * 16));
      object.submeshes.forEach((submesh, part) => {
        const geometry = geometryFor(`${batch.mesh}#${object.name}#${part}`, submesh, batch.mirrored);
        const material = built[Math.min(part, built.length - 1)]!;
        for (const chunk of partitionInstances(geometry, matrices, { cellSize, gridOrigin })) {
          stats.chunks += 1;
          const center = chunk.bounds.getCenter(new THREE.Vector3());
          const slot = pool.acquire({ geometry, material, castShadow: true, receiveShadow: true }, cellAt(center.x, center.z), chunk.matrices.length);
          if (slot !== null) {
            const members = chunk.matrices.map((matrix, index): ImportPlacement => ({ instanceId: "", index, matrix }));
            slot.place(members, slotOf, matrixOf);
            slot.sync(members, slotOf, matrixOf);
            slots.push(slot);
            continue;
          }
          const mesh = new THREE.InstancedMesh(geometry, material, chunk.matrices.length);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          uploadInstances(mesh, chunk.matrices, { bounds: chunk.bounds });
          root.add(mesh);
          freezeStaticTransforms(mesh);
          fallbacks.push(mesh);
        }
      });
      progress.instancesPlaced += batch.count;
    };

    const batchesByFile = new Map<string, ImportedBatchPlan[]>();
    for (const batch of plan.batches) {
      const list = batchesByFile.get(batch.mesh) ?? [];
      list.push(batch);
      batchesByFile.set(batch.mesh, list);
    }
    workers = createWorkerPool<ObjFileJob, ObjFileResult>({
      workers: options.workers ?? defaultWorkerCount(6),
      spawn: options.spawn ?? spawnObjWorker,
      name: "scene import worker",
      // Each OBJ waits on its fetch; held four deep, a worker parses one while the next downloads.
      jobsPerWorker: 4,
      isResult: isObjFileResult,
    });
    const parse = (url: string) => workers === null ? fetchObjFile(url, fetchImpl) : workers.run({ url });

    const loads = plan.meshFiles.map(async (meshFile) => {
      const batches = batchesByFile.get(meshFile)!;
      try {
        const parsed = await parse(at(meshFile));
        progress.bytes += parsed.bytes;
        // A texture starts when the first mesh that draws it arrives, so its requests spread over the load
        // instead of all starting in one task.
        const built = await Promise.all(batches.map((batch) => Promise.all(batch.materials.length === 0 ? [materialFor("")] : batch.materials.map(materialFor))));
        for (const [index, batch] of batches.entries()) enqueue(() => placeBatch(batch, parsed, built[index]!));
      } catch (error) {
        console.warn(`[jgengine] scene import: mesh ${meshFile} failed`, error);
        for (const batch of batches) stats.missingMeshes += batch.count;
      } finally {
        progress.meshFilesLoaded += 1;
        pending -= 1;
        report();
        wake?.();
      }
    });

    while (pending > 0 || tasks.length > 0) {
      if (tasks.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = null;
        continue;
      }
      const sliceEnds = performance.now() + budgetMs;
      while (tasks.length > 0 && performance.now() < sliceEnds) tasks.shift()!();
      report();
      if (tasks.length > 0 || pending > 0) await yieldThread();
    }
    await Promise.all(loads);
    workers?.reset();
    report();
    return {
      root,
      stats: {
        instances: plan.instances - stats.missingMeshes,
        skipped: plan.skipped,
        meshFiles: plan.meshFiles.length,
        missingMeshes: stats.missingMeshes,
        textures: textures.size,
        flatMaterials: stats.flatMaterials,
        batches: plan.batches.length,
        chunks: stats.chunks,
        draws: pool.batches() + fallbacks.length,
        bytes: progress.bytes,
        loadMs: performance.now() - started,
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  } finally {
    doneWork();
  }
}

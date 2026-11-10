/** @jsxImportSource @jgengine/core/ui/jsx */
// @skill jgengine-world
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { sharedGltfLoader } from "@jgengine/core/model/modelLoad.draw";
import { resolveModel } from "@jgengine/core/model/resolveModel";
import { buildScatterModelSources, disposeScatterModelSources, type ScatterModelSource } from "@jgengine/core/scatter/scatterModels.draw";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { livingWorld } from "@jgengine/core/weather/livingWorld.draw";

import { createAmbientFauna, FAUNA_GLOBAL_CAP, type FaunaSimulation, type FaunaFrame, type FaunaGroup, type FaunaGroupState } from "./ambientFauna";
import type { AmbientFaunaConfig, FaunaSpecies } from "./ambientFaunaConfig";
import { createFaunaView, selectVisible, writeFaunaView, type FaunaSelection, type FaunaView } from "./faunaCull";

const DEFAULT_DRAW_CAP = 1200;
const CULL_RADIUS = 2;

/** Props of {@link AmbientFauna}. */
export interface AmbientFaunaProps {
  config: AmbientFaunaConfig;
  /** Groups placed by `ambient_fauna` zones in the editor scene; added to `config.groups`. */
  zones?: readonly FaunaGroup[] | undefined;
  /** Resolves species given as catalog ids. */
  assets?: AssetCatalog | undefined;
  /** Ground height under a point; the seabed for fish and the floor for swarms. */
  groundAt?: ((x: number, z: number) => number) | undefined;
  /** Revision of ground height, when the field can track changes. */
  groundRevision?: (() => number | undefined) | undefined;
  /** The low graphics tier halves the agents. */
  lowTier?: boolean | undefined;
}

interface Shared {
  fauna: FaunaSimulation;
  view: FaunaView;
  budget: { remaining: number };
}

const scratchMatrix = new THREE.Matrix4();
const sourceMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchHeading = new THREE.Vector3();
const viewProjection = new THREE.Matrix4();

function writeAgent(state: FaunaGroupState, index: number, nose: THREE.Vector3, scale: number, stretch: number, out: THREE.Matrix4): void {
  const b = index * 3;
  scratchPosition.set((state.position[b] ?? 0), (state.position[b + 1] ?? 0), (state.position[b + 2] ?? 0));
  scratchHeading.set((state.velocity[b] ?? 0), (state.velocity[b + 1] ?? 0), (state.velocity[b + 2] ?? 0));
  if (scratchHeading.lengthSq() > 1e-8) scratchQuaternion.setFromUnitVectors(nose, scratchHeading.normalize());
  else scratchQuaternion.identity();
  scratchScale.set(scale, scale, scale * stretch);
  out.compose(scratchPosition, scratchQuaternion, scratchScale);
}

interface SpeciesBatch {
  species: FaunaSpecies;
  groups: readonly FaunaGroupState[];
  sources: ScatterModelSource[] | null;
  sourcesRoot: THREE.Object3D | null;
  capacity: number;
  widest: number;
  nearList: Int32Array;
  farList: Int32Array;
  selection: FaunaSelection;
  nose: THREE.Vector3;
  modelMeshes: (THREE.InstancedMesh | null)[];
  spriteMesh: THREE.InstancedMesh;
  spriteGeometry: THREE.BufferGeometry;
  spriteMaterial: THREE.MeshBasicMaterial;
}

function makeSpriteMesh(species: FaunaSpecies, capacity: number): { mesh: THREE.InstancedMesh; geometry: THREE.BufferGeometry; material: THREE.MeshBasicMaterial } {
  const sprite = species.sprite ?? { color: "#ffffff", size: 0.3 };
  const geometry = new THREE.OctahedronGeometry(1, 0);
  const material = new THREE.MeshBasicMaterial({ color: sprite.color, toneMapped: sprite.glow !== true, transparent: sprite.glow === true, opacity: sprite.glow === true ? 0.9 : 1 });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  return { mesh, geometry, material };
}

function speciesBatch(species: FaunaSpecies, groups: readonly FaunaGroupState[]): Omit<SpeciesBatch, "sources" | "sourcesRoot" | "modelMeshes"> {
  const capacity = Math.max(1, groups.reduce((sum, g) => sum + g.count, 0));
  const widest = Math.max(1, ...groups.map((g) => g.count));
  const sprite = makeSpriteMesh(species, capacity);
  return {
    species,
    groups,
    capacity,
    widest,
    nearList: new Int32Array(widest),
    farList: new Int32Array(widest),
    selection: { near: 0, far: 0 },
    nose: new THREE.Vector3(...(species.forward ?? [0, 0, -1])).normalize(),
    spriteMesh: sprite.mesh,
    spriteGeometry: sprite.geometry,
    spriteMaterial: sprite.material,
  };
}

function frameSpeciesBatch(batch: SpeciesBatch, shared: Shared): void {
  const { sources } = batch;
  const model = sources !== null;
  let spriteCount = 0;
  let modelCount = 0;
  const sprites = batch.spriteMesh;
  const { species } = batch;
  const scale = species.scale ?? 1;
  const sprite = species.sprite ?? { color: "#ffffff", size: 0.3 };
  for (const state of batch.groups) {
    if (shared.budget.remaining <= 0) break;
    selectVisible(state, shared.view, CULL_RADIUS, shared.budget.remaining, batch.nearList, batch.farList, batch.selection);
    shared.budget.remaining -= batch.selection.near + batch.selection.far;
    if (model && sources !== null) {
      for (let k = 0; k < batch.selection.near; k += 1) {
        writeAgent(state, (batch.nearList[k] ?? 0), batch.nose, scale, 1, scratchMatrix);
        for (let s = 0; s < sources.length; s += 1) {
          const source = sources[s];
          if (source !== undefined) batch.modelMeshes[s]?.setMatrixAt(modelCount, sourceMatrix.multiplyMatrices(scratchMatrix, source.localMatrix));
        }
        modelCount += 1;
      }
    }
    const total = batch.selection.near + batch.selection.far;
    for (let k = model ? batch.selection.near : 0; k < total; k += 1) {
      const index = k < batch.selection.near ? (batch.nearList[k] ?? 0) : (batch.farList[k - batch.selection.near] ?? 0);
      writeAgent(state, index, batch.nose, sprite.size, sprite.length ?? 1, scratchMatrix);
      sprites.setMatrixAt(spriteCount, scratchMatrix);
      spriteCount += 1;
    }
  }
  if (model && sources !== null) {
    for (let s = 0; s < sources.length; s += 1) {
      const mesh = batch.modelMeshes[s];
      if (mesh == null) continue;
      mesh.count = modelCount;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = modelCount > 0;
    }
  }
  sprites.count = spriteCount;
  sprites.instanceMatrix.needsUpdate = true;
  sprites.visible = spriteCount > 0;
}

function dropSpeciesBatch(batch: SpeciesBatch, parent: THREE.Object3D | null): void {
  parent?.remove(batch.spriteMesh);
  batch.spriteMesh.dispose();
  batch.spriteGeometry.dispose();
  batch.spriteMaterial.dispose();
  if (batch.sourcesRoot !== null) disposeScatterModelSources(batch.sourcesRoot);
  for (const mesh of batch.modelMeshes) {
    mesh?.removeFromParent();
    mesh?.dispose();
  }
}

/**
 * Draw-side form of {@link AmbientFauna}: the fauna simulation, shared cull view and per-species
 * instanced batches all live in the draw; species models load through the shared GLTF cache and a
 * failed load falls back to the sprite batch alone, matching the old error boundary.
 * @internal
 */
export function ambientFaunaDraw(getProps: () => AmbientFaunaProps): EngineDraw {
  const frame: FaunaFrame = { dt: 0, time: 0, sunHeight: null, focusX: 0, focusZ: 0 };
  let shared: Shared | null = null;
  let lastDeps: readonly unknown[] | null = null;
  let drawCap = DEFAULT_DRAW_CAP;
  let batches: SpeciesBatch[] = [];
  let parent: THREE.Object3D | null = null;
  let disposed = false;

  const dropAll = () => {
    for (const batch of batches) dropSpeciesBatch(batch, parent);
    batches = [];
  };

  const buildShared = (props: AmbientFaunaProps): Shared => {
    const groups = [...(props.config.groups ?? []), ...(props.zones ?? [])];
    const surface = props.config.surface;
    const fauna = createAmbientFauna(
      groups,
      {
        surfaceAt: typeof surface === "function" ? surface : () => surface ?? 0,
        ...(props.groundAt === undefined ? {} : { groundAt: props.groundAt }),
        ...(props.groundRevision === undefined ? {} : { groundRevision: props.groundRevision }),
        ...(props.config.plantAt === undefined ? {} : { plantAt: props.config.plantAt }),
        ...(props.config.wind === undefined ? {} : { wind: props.config.wind }),
      },
      { globalCap: Math.floor((props.config.globalCap ?? FAUNA_GLOBAL_CAP) * (props.lowTier === true ? 0.5 : 1)), ...(props.config.simulateRange === undefined ? {} : { simulateRange: props.config.simulateRange }) },
    );
    return { fauna, view: createFaunaView(), budget: { remaining: 0 } };
  };

  const speciesModel = (props: AmbientFaunaProps, species: FaunaSpecies): ModelConfig | undefined => {
    if (typeof species.model !== "string") return species.model;
    return props.assets === undefined ? undefined : (resolveModel(species.model, props.assets) ?? undefined);
  };

  const sync = () => {
    const props = getProps();
    // The same inputs the old `useMemo` rebuilt `shared` on, compared by identity.
    const deps: readonly unknown[] = [
      props.config.groups, props.zones, props.config.surface, props.config.plantAt, props.config.wind,
      props.config.globalCap, props.config.simulateRange, props.groundAt, props.groundRevision,
      props.lowTier === true, props.config.species, props.config.drawCap,
    ];
    drawCap = (props.config.drawCap ?? DEFAULT_DRAW_CAP) * (props.lowTier === true ? 0.5 : 1);
    const prev = lastDeps;
    if (prev !== null && prev.length === deps.length && deps.every((dep, index) => dep === prev[index])) return;
    lastDeps = deps;
    dropAll();
    shared = buildShared(props);
    if (parent === null) return;
    const seen = new Set<string>();
    for (const group of shared.fauna.groups) {
      if (group.count <= 0 || seen.has(group.spec.species)) continue;
      seen.add(group.spec.species);
      const species = props.config.species[group.spec.species];
      if (species === undefined) continue;
      const own = shared.fauna.groups.filter((g) => g.spec.species === group.spec.species);
      const batch: SpeciesBatch = { ...speciesBatch(species, own), sources: null, sourcesRoot: null, modelMeshes: [] };
      const model = speciesModel(props, species);
      const attach = (sources: ScatterModelSource[] | null, root: THREE.Object3D | null) => {
        if (disposed || batches.indexOf(batch) < 0) {
          if (root !== null) disposeScatterModelSources(root);
          return;
        }
        batch.sources = sources;
        batch.sourcesRoot = root;
        if (sources !== null) {
          batch.modelMeshes = sources.map((source) => {
            const mesh = new THREE.InstancedMesh(source.geometry, source.material, batch.capacity);
            mesh.frustumCulled = false;
            parent?.add(mesh);
            return mesh;
          });
        }
      };
      if (model !== undefined) {
        sharedGltfLoader
          .loadAsync(model.url)
          .then((gltf) => {
            try {
              const built = buildScatterModelSources(gltf.scene, model);
              attach(built.sources, built.root);
            } catch {
              attach(null, null);
            }
          })
          .catch(() => attach(null, null));
      }
      parent.add(batch.spriteMesh);
      batches.push(batch);
    }
  };

  return {
    mount(state: EngineFrameState) {
      parent = state.scene;
      disposed = false;
      sync();
    },
    update() {
      sync();
    },
    frame(state: EngineFrameState) {
      sync();
      const current = shared;
      if (current === null) return;
      frame.dt = state.delta;
      frame.time = state.clock.elapsedTime;
      frame.sunHeight = livingWorld.sunHeight;
      frame.focusX = state.camera.position.x;
      frame.focusZ = state.camera.position.z;
      current.fauna.update(frame);
      viewProjection.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
      writeFaunaView(current.view, viewProjection.elements, state.camera.position.x, state.camera.position.y, state.camera.position.z);
      current.budget.remaining = drawCap;
      for (const batch of batches) frameSpeciesBatch(batch, current);
    },
    dispose() {
      disposed = true;
      dropAll();
      shared = null;
      lastDeps = null;
      parent = null;
    },
  };
}

/**
 * Ambient fauna: fish schools, insect swarms, drifting motes and soaring flyers, one instanced draw
 * per species part. Agents within a group's `lod.near` draw the species model, the rest to `lod.far`
 * a sprite; off-screen agents are skipped, each group draws at most its `budget`, all groups at most
 * `config.drawCap`. Groups come from `config.groups` and the `ambient_fauna` zones in the editor scene.
 * @capability ambient-fauna-render draw ambient fauna as instanced species models with distance LOD, frustum culling, a per-group budget and a global draw cap
 */
export function AmbientFauna(props: AmbientFaunaProps) {
  const latest = useRef(props);
  latest.current = props;
  return <EngineDrawMount create={() => ambientFaunaDraw(() => latest.current)} deps={[]} />;
}

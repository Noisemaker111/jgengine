// @skill jgengine-world
import { useFrame, useLoader } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, type ReactElement, type ReactNode } from "react";
import * as THREE from "three";

import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { sharedGltfLoader } from "@jgengine/core/model/modelLoad.draw";
import { resolveModel } from "@jgengine/core/model/resolveModel";
import { buildScatterModelSources, disposeScatterModelSources, type ScatterModelSource } from "@jgengine/core/scatter/scatterModels.draw";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { livingWorld } from "@jgengine/core/weather/livingWorld.draw";

import { createAmbientFauna, FAUNA_GLOBAL_CAP, type AmbientFauna, type FaunaFrame, type FaunaGroup, type FaunaGroupState } from "./ambientFauna";
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
  /** The low graphics tier halves the agents. */
  lowTier?: boolean | undefined;
}

interface Shared {
  fauna: AmbientFauna;
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

interface BatchProps {
  species: FaunaSpecies;
  groups: readonly FaunaGroupState[];
  shared: Shared;
  sources: ScatterModelSource[] | null;
}

/** One species: a mesh per model part for the near agents and one sprite mesh for the rest, filled each frame. */
function SpeciesBatch({ species, groups, shared, sources }: BatchProps): ReactElement {
  const capacity = Math.max(1, groups.reduce((sum, g) => sum + g.count, 0));
  const widest = Math.max(1, ...groups.map((g) => g.count));
  const nearList = useMemo(() => new Int32Array(widest), [widest]);
  const farList = useMemo(() => new Int32Array(widest), [widest]);
  const selection = useMemo<FaunaSelection>(() => ({ near: 0, far: 0 }), []);
  const nose = useMemo(() => new THREE.Vector3(...(species.forward ?? [0, 0, -1])).normalize(), [species.forward]);
  const modelMeshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const spriteMesh = useRef<THREE.InstancedMesh>(null);
  const sprite = species.sprite ?? { color: "#ffffff", size: 0.3 };
  const spriteGeometry = useMemo(() => new THREE.OctahedronGeometry(1, 0), []);
  const spriteMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: sprite.color, toneMapped: sprite.glow !== true, transparent: sprite.glow === true, opacity: sprite.glow === true ? 0.9 : 1 }),
    [sprite.color, sprite.glow],
  );
  useEffect(() => () => { spriteGeometry.dispose(); }, [spriteGeometry]);
  useEffect(() => () => { spriteMaterial.dispose(); }, [spriteMaterial]);

  useFrame(() => {
    const model = sources !== null;
    let spriteCount = 0;
    let modelCount = 0;
    const sprites = spriteMesh.current;
    for (const state of groups) {
      if (shared.budget.remaining <= 0) break;
      selectVisible(state, shared.view, CULL_RADIUS, shared.budget.remaining, nearList, farList, selection);
      shared.budget.remaining -= selection.near + selection.far;
      const scale = species.scale ?? 1;
      if (model) {
        for (let k = 0; k < selection.near; k += 1) {
          writeAgent(state, (nearList[k] ?? 0), nose, scale, 1, scratchMatrix);
          for (let s = 0; s < sources.length; s += 1) {
            const source = sources[s];
            if (source !== undefined) modelMeshes.current[s]?.setMatrixAt(modelCount, sourceMatrix.multiplyMatrices(scratchMatrix, source.localMatrix));
          }
          modelCount += 1;
        }
      }
      if (sprites !== null) {
        const total = selection.near + selection.far;
        for (let k = model ? selection.near : 0; k < total; k += 1) {
          const index = k < selection.near ? (nearList[k] ?? 0) : (farList[k - selection.near] ?? 0);
          writeAgent(state, index, nose, sprite.size, sprite.length ?? 1, scratchMatrix);
          sprites.setMatrixAt(spriteCount, scratchMatrix);
          spriteCount += 1;
        }
      }
    }
    if (model) {
      for (let s = 0; s < sources.length; s += 1) {
        const mesh = modelMeshes.current[s];
        if (mesh == null) continue;
        mesh.count = modelCount;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.visible = modelCount > 0;
      }
    }
    if (sprites !== null) {
      sprites.count = spriteCount;
      sprites.instanceMatrix.needsUpdate = true;
      sprites.visible = spriteCount > 0;
    }
  }, 1);

  return (
    <>
      {sources?.map((source, index) => (
        <instancedMesh
          key={index}
          ref={(mesh) => { modelMeshes.current[index] = mesh; }}
          args={[source.geometry, source.material, capacity]}
          frustumCulled={false}
        />
      ))}
      <instancedMesh ref={spriteMesh} args={[spriteGeometry, spriteMaterial, capacity]} frustumCulled={false} />
    </>
  );
}

/** A model that fails to load falls back to its sprite alone. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  override render(): ReactNode { return this.state.failed ? this.props.fallback : this.props.children; }
}

function ModelSpecies({ species, model, groups, shared }: { species: FaunaSpecies; model: ModelConfig; groups: readonly FaunaGroupState[]; shared: Shared }): ReactElement {
  const gltf = useLoader(sharedGltfLoader, model.url);
  const built = useMemo(() => buildScatterModelSources(gltf.scene, model), [gltf, model]);
  useEffect(() => () => disposeScatterModelSources(built.root), [built]);
  return <SpeciesBatch species={species} groups={groups} shared={shared} sources={built.sources} />;
}

/**
 * Ambient fauna: fish schools, insect swarms, drifting motes and soaring flyers, one instanced draw
 * per species part. Agents within a group's `lod.near` draw the species model, the rest to `lod.far`
 * a sprite; off-screen agents are skipped, each group draws at most its `budget`, all groups at most
 * `config.drawCap`. Groups come from `config.groups` and the `ambient_fauna` zones in the editor scene.
 * @capability ambient-fauna-render draw ambient fauna as instanced species models with distance LOD, frustum culling, a per-group budget and a global draw cap
 */
export function AmbientFauna({ config, zones, assets, groundAt, lowTier = false }: AmbientFaunaProps): ReactElement | null {
  const groups = useMemo(() => [...(config.groups ?? []), ...(zones ?? [])], [config.groups, zones]);
  const shared = useMemo<Shared>(() => {
    const surface = config.surface;
    const fauna = createAmbientFauna(
      groups,
      {
        surfaceAt: typeof surface === "function" ? surface : () => surface ?? 0,
        ...(groundAt === undefined ? {} : { groundAt }),
        ...(config.plantAt === undefined ? {} : { plantAt: config.plantAt }),
        ...(config.wind === undefined ? {} : { wind: config.wind }),
      },
      { globalCap: Math.floor((config.globalCap ?? FAUNA_GLOBAL_CAP) * (lowTier ? 0.5 : 1)), ...(config.simulateRange === undefined ? {} : { simulateRange: config.simulateRange }) },
    );
    return { fauna, view: createFaunaView(), budget: { remaining: 0 } };
  }, [groups, config.surface, config.plantAt, config.wind, config.globalCap, config.simulateRange, groundAt, lowTier]);
  const frame = useRef<FaunaFrame>({ dt: 0, time: 0, sunHeight: null, focusX: 0, focusZ: 0 });
  const drawCap = (config.drawCap ?? DEFAULT_DRAW_CAP) * (lowTier ? 0.5 : 1);

  useFrame(({ camera, clock }, delta) => {
    const f = frame.current;
    f.dt = delta;
    f.time = clock.elapsedTime;
    f.sunHeight = livingWorld.sunHeight;
    f.focusX = camera.position.x;
    f.focusZ = camera.position.z;
    shared.fauna.update(f);
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    writeFaunaView(shared.view, viewProjection.elements, camera.position.x, camera.position.y, camera.position.z);
    shared.budget.remaining = drawCap;
  }, 0);

  const speciesIds = useMemo(() => [...new Set(shared.fauna.groups.filter((g) => g.count > 0).map((g) => g.spec.species))], [shared]);
  if (speciesIds.length === 0) return null;
  return (
    <>
      {speciesIds.map((id) => {
        const species = config.species[id];
        if (species === undefined) return null;
        const own = shared.fauna.groups.filter((g) => g.spec.species === id);
        const model = typeof species.model === "string" ? (assets === undefined ? undefined : resolveModel(species.model, assets)) : species.model;
        const plain = <SpeciesBatch key={`${id}:sprite`} species={species} groups={own} shared={shared} sources={null} />;
        if (model === undefined) return plain;
        return (
          <ModelBoundary key={id} fallback={plain}>
            <Suspense fallback={null}>
              <ModelSpecies species={species} model={model} groups={own} shared={shared} />
            </Suspense>
          </ModelBoundary>
        );
      })}
    </>
  );
}

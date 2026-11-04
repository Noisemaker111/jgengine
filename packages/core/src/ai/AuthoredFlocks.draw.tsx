// @skill jgengine-world
import { useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import * as THREE from "three";

import type { FlockStepAgent } from "@jgengine/core/ai/flock";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { useGameContext } from "@jgengine/react/provider";

import { IsolatedEntityModel } from "@jgengine/core/model/SceneModels.draw";
import { sharedGltfLoader } from "@jgengine/core/model/modelLoad.draw";
import { resolveModel } from "@jgengine/core/model/resolveModel";
import { canInstanceStaticScene } from "@jgengine/core/instancing/staticObjectBatches.draw";
import { buildScatterModelSources, disposeScatterModelSources, type ScatterModelSource } from "@jgengine/core/scatter/scatterModels.draw";

/** Caller-owned species models for authored habitat agents. */
export interface AuthoredFlocksProps {
  models: Record<string, string | ModelConfig>;
  assets?: AssetCatalog | undefined;
  /** Model nose axis. Default -Z. */
  forward?: readonly [number, number, number];
  maxInstances?: number;
}

/** @internal Orient habitat agents from their full authoritative velocity. */
export function applyFlockPose(group: THREE.Object3D, agent: FlockStepAgent, forward: THREE.Vector3, direction: THREE.Vector3): void {
  group.position.set(...agent.position);
  direction.set(...agent.velocity);
  if (direction.lengthSq() > 1e-12) group.quaternion.setFromUnitVectors(forward, direction.normalize());
}

/**
 * Whether a species can draw every agent as instances of one mesh per material: a model with no
 * animation, parts, attachments, variants or per-node edits, whose loaded scene instances as is.
 * @internal
 */
export function flockSpeciesInstances(model: ModelConfig, gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }): boolean {
  const hidden = model.hiddenNodes;
  return model.parts === undefined && (model.attachments?.length ?? 0) === 0 && model.variants === undefined &&
    model.partMotion === undefined && (model.materialAssignments?.length ?? 0) === 0 && model.material?.maps === undefined &&
    (hidden === undefined || (Array.isArray(hidden) && hidden.length === 0)) && canInstanceStaticScene(gltf.scene, gltf.animations);
}

/**
 * Pose `count` instances of one source at the agents: each agent's position and heading, then the
 * source's own offset in the model. Leaves the mesh drawing exactly those agents.
 * @internal
 */
export function writeFlockInstances(
  mesh: THREE.InstancedMesh,
  source: Pick<ScatterModelSource, "localMatrix">,
  agents: readonly FlockStepAgent[],
  forward: THREE.Vector3,
  scratch: { pose: THREE.Object3D; direction: THREE.Vector3; matrix: THREE.Matrix4 },
): void {
  const count = Math.min(agents.length, mesh.instanceMatrix.count);
  for (let index = 0; index < count; index += 1) {
    applyFlockPose(scratch.pose, agents[index]!, forward, scratch.direction);
    scratch.pose.updateMatrix();
    mesh.setMatrixAt(index, scratch.matrix.multiplyMatrices(scratch.pose.matrix, source.localMatrix));
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/** The cosmetic agents of one species this frame, up to `cap`, written into `into`. */
function speciesAgents(flocks: readonly { role: string; species: string; agents: readonly FlockStepAgent[] }[], species: string, cap: number, into: FlockStepAgent[]): FlockStepAgent[] {
  into.length = 0;
  for (const flock of flocks) {
    if (flock.role !== "cosmetic" || flock.species !== species) continue;
    for (const agent of flock.agents) {
      if (into.length >= cap) return into;
      into.push(agent);
    }
  }
  return into;
}

/**
 * Render bounded authored habitat agents with game-selected species models. The
 * environment owns movement and lifetime. A species whose model has no animation draws every agent
 * as instances, one draw per material however big the flock; an animated one draws each agent on its
 * own rig. Unmapped species have no substitute geometry.
 * @capability authored-flocks render authored habitat agents through caller-selected animated species models with velocity orientation and bounded model lifetime
 */
export function AuthoredFlocks({ models, assets, forward = [0, 0, -1], maxInstances = 256 }: AuthoredFlocksProps): ReactElement {
  const ctx = useGameContext();
  const speciesModels = useMemo(() => {
    const resolved = new Map<string, ModelConfig>();
    for (const [species, value] of Object.entries(models)) {
      if (typeof value === "string" && assets === undefined) throw new Error(`[jgengine] flock species ${species} requires an asset catalog to resolve ${value}`);
      const model = typeof value === "string" ? resolveModel(value, assets!)! : value;
      resolved.set(species, model.animation === undefined ? { ...model, animation: "auto" } : model);
    }
    return resolved;
  }, [models, assets]);
  const nose = useMemo(() => {
    const axis = new THREE.Vector3(...forward).normalize();
    return axis.lengthSq() === 0 ? axis.set(0, 0, -1) : axis;
  }, [forward[0], forward[1], forward[2]]);
  const limit = Number.isFinite(maxInstances) ? Math.max(0, Math.min(1024, Math.floor(maxInstances))) : 256;
  // Each species' share of `limit`, in flock order; a species drawing no agent is unmounted.
  const caps = useRef(new Map<string, number>());
  const [shown, setShown] = useState<readonly string[]>([]);

  useFrame(() => {
    const next = caps.current;
    for (const species of next.keys()) next.set(species, 0);
    let count = 0;
    for (const flock of ctx.environment.flocks()) {
      if (flock.role !== "cosmetic" || !speciesModels.has(flock.species) || count >= limit) continue;
      const taken = Math.min(flock.agents.length, limit - count);
      next.set(flock.species, (next.get(flock.species) ?? 0) + taken);
      count += taken;
    }
    let changed = false;
    for (const [species, cap] of next) if ((cap > 0) !== shown.includes(species)) changed = true;
    if (changed) setShown([...next].filter(([, cap]) => cap > 0).map(([species]) => species));
  });

  return (
    <>
      {shown.map((species) => (
        <Suspense key={species} fallback={null}>
          <FlockSpecies species={species} model={speciesModels.get(species)!} caps={caps} limit={limit} nose={nose} />
        </Suspense>
      ))}
    </>
  );
}

interface SpeciesProps {
  species: string;
  model: ModelConfig;
  caps: { current: ReadonlyMap<string, number> };
  limit: number;
  nose: THREE.Vector3;
}

function FlockSpecies(props: SpeciesProps): ReactElement {
  const gltf = useLoader(sharedGltfLoader, props.model.url);
  const instanced = useMemo(() => flockSpeciesInstances(props.model, gltf), [props.model, gltf]);
  return instanced ? <InstancedFlock {...props} gltf={gltf} /> : <RiggedFlock {...props} />;
}

function InstancedFlock({ species, model, caps, limit, nose, gltf }: SpeciesProps & { gltf: { scene: THREE.Object3D } }): ReactElement {
  const ctx = useGameContext();
  const harvested = useMemo(() => buildScatterModelSources(gltf.scene, model), [gltf, model]);
  useEffect(() => () => disposeScatterModelSources(harvested.root), [harvested]);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const scratch = useMemo(() => ({ pose: new THREE.Object3D(), direction: new THREE.Vector3(), matrix: new THREE.Matrix4(), agents: [] as FlockStepAgent[] }), []);
  useFrame(() => {
    const agents = speciesAgents(ctx.environment.flocks(), species, caps.current.get(species) ?? 0, scratch.agents);
    harvested.sources.forEach((source, index) => {
      const mesh = meshes.current[index];
      if (mesh !== null && mesh !== undefined) writeFlockInstances(mesh, source, agents, nose, scratch);
    });
  });
  return (
    <>
      {harvested.sources.map((source, index) => (
        <instancedMesh
          key={index}
          ref={(mesh: THREE.InstancedMesh | null) => {
            meshes.current[index] = mesh;
            if (mesh !== null) mesh.count = 0;
          }}
          args={[source.geometry, source.material, limit]}
          castShadow={source.castShadow ?? false}
          receiveShadow={source.receiveShadow ?? false}
          dispose={null}
        />
      ))}
    </>
  );
}

/** An animated species: each agent on its own rig, keyed by flock and slot so a rig follows one bird. */
function RiggedFlock({ species, model, caps, nose }: SpeciesProps): ReactElement {
  const ctx = useGameContext();
  const entries = useRef(new Map<string, { agent: FlockStepAgent; group: THREE.Group | null }>());
  const seen = useRef(new Set<string>());
  const direction = useRef(new THREE.Vector3());
  const [, setGeneration] = useState(0);

  useFrame(() => {
    let changed = false;
    let count = 0;
    const cap = caps.current.get(species) ?? 0;
    seen.current.clear();
    for (const flock of ctx.environment.flocks()) {
      if (flock.role !== "cosmetic" || flock.species !== species) continue;
      for (let i = 0; i < flock.agents.length && count < cap; i++, count++) {
        const key = `${flock.id}:${i}`;
        const agent = flock.agents[i]!;
        seen.current.add(key);
        const current = entries.current.get(key);
        if (current === undefined) {
          entries.current.set(key, { agent, group: null });
          changed = true;
        } else {
          current.agent = agent;
          if (current.group !== null) applyFlockPose(current.group, agent, nose, direction.current);
        }
      }
    }
    for (const key of entries.current.keys()) if (!seen.current.has(key)) { entries.current.delete(key); changed = true; }
    if (changed) setGeneration((n) => n + 1);
  });

  return <>{Array.from(entries.current, ([key, entry]) => <group key={key} ref={(group) => {
    entry.group = group;
    if (group !== null) applyFlockPose(group, entry.agent, nose, direction.current);
  }}>
    <IsolatedEntityModel model={model} />
  </group>)}</>;
}

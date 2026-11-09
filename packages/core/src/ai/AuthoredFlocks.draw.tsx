// @skill jgengine-world
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { FlockStepAgent } from "@jgengine/core/ai/flock";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import { useGameContext } from "@jgengine/react/provider";

import { isolatedEntityModelDraw, preloadSceneModel } from "@jgengine/core/model/entityModelDraw.draw";
import { resolveModel } from "@jgengine/core/model/resolveModel";
import { canInstanceStaticScene } from "@jgengine/core/instancing/staticObjectBatches.draw";
import { buildScatterModelSources, disposeScatterModelSources, type ScatterModelSource } from "@jgengine/core/scatter/scatterModels.draw";
import { childFrameState, type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { joinFrameTask } from "@jgengine/core/frame/frameBoard.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

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
export function AuthoredFlocks({ models, assets, forward = [0, 0, -1], maxInstances = 256 }: AuthoredFlocksProps) {
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
  const latest = useRef({ ctx, speciesModels, nose, limit });
  latest.current = { ctx, speciesModels, nose, limit };
  useEngineDraw(() => authoredFlocksDraw(() => latest.current), [speciesModels, nose, limit]);
  return null;
}

interface FlockDrawEnv {
  ctx: GameContext;
  speciesModels: ReadonlyMap<string, ModelConfig>;
  nose: THREE.Vector3;
  limit: number;
}

/** A child draw mounted under a parent group: fresh child frame state per call, board-joined frame. */
class ChildDraw {
  private leave: (() => void) | null = null;
  constructor(private readonly draw: EngineDraw, private readonly parent: THREE.Object3D) {}
  mount(state: EngineFrameState): void {
    const parent = this.parent;
    this.draw.mount?.(childFrameState(state, parent));
    this.leave = joinFrameTask(this.draw.priority ?? 0, (s) => this.draw.frame?.(childFrameState(s, parent)));
  }
  dispose(state: EngineFrameState): void {
    this.leave?.();
    this.leave = null;
    this.draw.dispose?.(childFrameState(state, this.parent));
  }
}

interface SpeciesEntry {
  mounted: ChildDraw | null;
  cancelled: boolean;
}

/**
 * Every species' share of `limit`, in flock order; a species drawing no agent keeps no draw. The
 * per-frame reconcile mounts a species' draw once its model resolves and drops it when its share
 * empties — the draw-side `AuthoredFlocks` + `FlockSpecies`.
 */
function authoredFlocksDraw(getEnv: () => FlockDrawEnv): EngineDraw {
  const group = new THREE.Group();
  const caps = new Map<string, number>();
  const species = new Map<string, SpeciesEntry>();
  let stateRef: EngineFrameState | null = null;
  let leaveTask: (() => void) | null = null;

  const dropSpecies = (key: string, state: EngineFrameState) => {
    const entry = species.get(key);
    if (entry === undefined) return;
    entry.cancelled = true;
    entry.mounted?.dispose(state);
    species.delete(key);
  };

  const loadSpecies = async (key: string, model: ModelConfig) => {
    const entry: SpeciesEntry = { mounted: null, cancelled: false };
    species.set(key, entry);
    try {
      const gltf = await preloadSceneModel(model.url);
      if (entry.cancelled || stateRef === null) return;
      const env = getEnv();
      const draw = flockSpeciesInstances(model, gltf)
        ? instancedFlockDraw({ ctx: env.ctx, species: key, model, gltf, caps, nose: env.nose, limit: env.limit })
        : riggedFlockDraw({ ctx: env.ctx, species: key, model, caps, nose: env.nose });
      const mounted = new ChildDraw(draw, group);
      mounted.mount(stateRef);
      entry.mounted = mounted;
    } catch (error) {
      // A species that fails to load or harvest draws nothing, like the old Suspense/boundary null.
      console.error("[jgengine:flocks] species load failed", key, model.url, error);
    }
  };

  return {
    mount(state: EngineFrameState) {
      stateRef = state;
      state.scene.add(group);
      leaveTask = joinFrameTask(0, () => {
        const env = getEnv();
        for (const key of caps.keys()) caps.set(key, 0);
        let count = 0;
        for (const flock of env.ctx.environment.flocks()) {
          if (flock.role !== "cosmetic" || !env.speciesModels.has(flock.species) || count >= env.limit) continue;
          const taken = Math.min(flock.agents.length, env.limit - count);
          caps.set(flock.species, (caps.get(flock.species) ?? 0) + taken);
          count += taken;
        }
        for (const key of [...species.keys()]) {
          if ((caps.get(key) ?? 0) <= 0) dropSpecies(key, state);
        }
        for (const [key, cap] of caps) {
          if (cap <= 0 || species.has(key)) continue;
          const model = env.speciesModels.get(key);
          if (model === undefined || stateRef === null) continue;
          void loadSpecies(key, model);
        }
      });
    },
    dispose(state: EngineFrameState) {
      leaveTask?.();
      leaveTask = null;
      for (const key of [...species.keys()]) dropSpecies(key, state);
      stateRef = null;
      state.scene.remove(group);
    },
  };
}

/** A species whose model instances as-is: one instanced draw per material, posed every frame. */
function instancedFlockDraw(args: {
  ctx: GameContext;
  species: string;
  model: ModelConfig;
  gltf: GLTF;
  caps: ReadonlyMap<string, number>;
  nose: THREE.Vector3;
  limit: number;
}): EngineDraw {
  const harvested = buildScatterModelSources(args.gltf.scene, args.model);
  const meshes: (THREE.InstancedMesh | null)[] = [];
  const scratch = { pose: new THREE.Object3D(), direction: new THREE.Vector3(), matrix: new THREE.Matrix4(), agents: [] as FlockStepAgent[] };
  let leave: (() => void) | null = null;
  return {
    mount(state: EngineFrameState) {
      harvested.sources.forEach((source, index) => {
        const mesh = new THREE.InstancedMesh(source.geometry, source.material, args.limit);
        mesh.castShadow = source.castShadow ?? false;
        mesh.receiveShadow = source.receiveShadow ?? false;
        mesh.count = 0;
        state.scene.add(mesh);
        meshes[index] = mesh;
      });
      leave = joinFrameTask(0, () => {
        const agents = speciesAgents(args.ctx.environment.flocks(), args.species, args.caps.get(args.species) ?? 0, scratch.agents);
        harvested.sources.forEach((source, index) => {
          const mesh = meshes[index];
          if (mesh !== null && mesh !== undefined) writeFlockInstances(mesh, source, agents, args.nose, scratch);
        });
      });
    },
    dispose(state: EngineFrameState) {
      leave?.();
      for (const mesh of meshes) {
        if (mesh !== null && mesh !== undefined) {
          state.scene.remove(mesh);
          mesh.dispose();
        }
      }
      meshes.length = 0;
      disposeScatterModelSources(harvested.root);
    },
  };
}

/** An animated species: each agent on its own rig under a keyed group, reconciled every frame. */
function riggedFlockDraw(args: {
  ctx: GameContext;
  species: string;
  model: ModelConfig;
  caps: ReadonlyMap<string, number>;
  nose: THREE.Vector3;
}): EngineDraw {
  const group = new THREE.Group();
  const entries = new Map<string, { agentGroup: THREE.Group; mounted: ChildDraw }>();
  const seen = new Set<string>();
  const direction = new THREE.Vector3();
  let stateRef: EngineFrameState | null = null;
  let leave: (() => void) | null = null;

  const dropEntry = (key: string, state: EngineFrameState) => {
    const entry = entries.get(key);
    if (entry === undefined) return;
    entry.mounted.dispose(state);
    group.remove(entry.agentGroup);
    entries.delete(key);
  };

  return {
    mount(state: EngineFrameState) {
      stateRef = state;
      state.scene.add(group);
      leave = joinFrameTask(0, () => {
        if (stateRef === null) return;
        let count = 0;
        const cap = args.caps.get(args.species) ?? 0;
        seen.clear();
        for (const flock of args.ctx.environment.flocks()) {
          if (flock.role !== "cosmetic" || flock.species !== args.species) continue;
          for (let i = 0; i < flock.agents.length && count < cap; i++, count++) {
            const key = `${flock.id}:${i}`;
            const agent = flock.agents[i]!;
            seen.add(key);
            const current = entries.get(key);
            if (current === undefined) {
              const agentGroup = new THREE.Group();
              applyFlockPose(agentGroup, agent, args.nose, direction);
              const mounted = new ChildDraw(isolatedEntityModelDraw({ model: args.model, ctx: args.ctx }), agentGroup);
              mounted.mount(stateRef);
              group.add(agentGroup);
              entries.set(key, { agentGroup, mounted });
            } else {
              applyFlockPose(current.agentGroup, agent, args.nose, direction);
            }
          }
        }
        for (const key of entries.keys()) if (!seen.has(key)) dropEntry(key, stateRef);
      });
    },
    dispose(state: EngineFrameState) {
      leave?.();
      for (const key of [...entries.keys()]) dropEntry(key, state);
      stateRef = null;
      state.scene.remove(group);
    },
  };
}

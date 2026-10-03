import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState, type ReactElement } from "react";
import * as THREE from "three";

import type { FlockStepAgent } from "@jgengine/core/ai/flock";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { useGameContext } from "@jgengine/react/provider";

import { IsolatedEntityModel } from "../render/SceneModels";
import { resolveModel } from "../render/resolveModel";

/** Caller-owned species models for authored habitat agents. */
export interface AuthoredFlocksProps {
  models: Record<string, string | ModelConfig>;
  assets?: AssetCatalog;
  /** Model nose axis. Default -Z. */
  forward?: readonly [number, number, number];
  maxInstances?: number;
}

/** @internal Orient habitat agents from their full authoritative velocity. */
export function applyFlockPose(group: THREE.Group, agent: FlockStepAgent, forward: THREE.Vector3, direction: THREE.Vector3): void {
  group.position.set(...agent.position);
  direction.set(...agent.velocity);
  if (direction.lengthSq() > 1e-12) group.quaternion.setFromUnitVectors(forward, direction.normalize());
}

/**
 * Render bounded authored habitat agents with game-selected species models. The
 * environment owns movement and lifetime; existing model owners load, animate,
 * and dispose the native GLB. Unmapped species have no substitute geometry.
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
  const entries = useRef(new Map<string, { agent: FlockStepAgent; model: ModelConfig; group: THREE.Group | null }>());
  const seen = useRef(new Set<string>());
  const direction = useRef(new THREE.Vector3());
  const nose = useRef(new THREE.Vector3());
  const [, setGeneration] = useState(0);
  nose.current.set(...forward).normalize();
  if (nose.current.lengthSq() === 0) nose.current.set(0, 0, -1);
  const limit = Number.isFinite(maxInstances) ? Math.max(0, Math.min(1024, Math.floor(maxInstances))) : 256;

  useFrame(() => {
    let changed = false;
    let count = 0;
    seen.current.clear();
    for (const flock of ctx.environment.flocks()) {
      if (flock.role !== "cosmetic") continue;
      const model = speciesModels.get(flock.species);
      if (model === undefined) continue;
      for (let i = 0; i < flock.agents.length && count < limit; i++, count++) {
        const key = `${flock.id}:${i}`;
        const agent = flock.agents[i]!;
        seen.current.add(key);
        const current = entries.current.get(key);
        if (current === undefined) { entries.current.set(key, { agent, model, group: null }); changed = true; }
        else {
          current.agent = agent;
          if (current.model !== model) { current.model = model; changed = true; }
          if (current.group !== null) applyFlockPose(current.group, agent, nose.current, direction.current);
        }
      }
      if (count >= limit) break;
    }
    for (const key of entries.current.keys()) if (!seen.current.has(key)) { entries.current.delete(key); changed = true; }
    if (changed) setGeneration((n) => n + 1);
  });

  return <>{Array.from(entries.current, ([key, entry]) => <group key={key} ref={(group) => {
    entry.group = group;
    if (group !== null) applyFlockPose(group, entry.agent, nose.current, direction.current);
  }}>
    <IsolatedEntityModel model={entry.model} />
  </group>)}</>;
}

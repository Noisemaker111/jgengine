/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { LiveProjectile } from "@jgengine/core/combat/projectiles";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { useGameContext } from "@jgengine/react/provider";
import { childFrameState, type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

import { isolatedEntityModelDraw } from "@jgengine/core/model/entityModelDraw.draw";

/** Explicit opt-in shaft/head geometry when a game has no projectile model. */
export interface ProjectileShaft {
  length?: number;
  radius?: number;
  shaftColor?: THREE.ColorRepresentation;
  headColor?: THREE.ColorRepresentation;
}

/** Render simulated flights without owning their travel or settlement. */
export interface ProjectileModelsProps {
  model?: ModelConfig | ((projectile: LiveProjectile) => ModelConfig | undefined);
  /** Defaults to no fallback geometry. */
  fallback?: ProjectileShaft;
  /** The model's nose axis. Default +Y, matching the shaft fallback. */
  forward?: readonly [number, number, number];
  maxInstances?: number;
  /** An alternate authoritative source; otherwise uses the context's live flights. */
  source?: () => readonly LiveProjectile[];
}

/** @internal Apply live position and full velocity orientation without frame allocations. */
export function applyProjectilePose(group: THREE.Group, projectile: Pick<LiveProjectile, "position" | "velocity">, forward: THREE.Vector3, direction: THREE.Vector3): void {
  group.position.set(...projectile.position);
  direction.set(...projectile.velocity);
  if (direction.lengthSq() > 1e-12) group.quaternion.setFromUnitVectors(forward, direction.normalize());
}

function buildShaft(fallback: ProjectileShaft): { meshes: THREE.Mesh[]; dispose(): void } {
  const length = fallback.length ?? 0.85;
  const radius = fallback.radius ?? 0.012;
  const headLength = length * 0.18;
  const shaftGeometry = new THREE.CylinderGeometry(radius, radius, length - headLength, 6);
  const headGeometry = new THREE.ConeGeometry(radius * 3.5, headLength, 6);
  const shaftMaterial = new THREE.MeshStandardMaterial({ color: fallback.shaftColor ?? "#947044", roughness: 0.78 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: fallback.headColor ?? "#b9c4d0", metalness: 0.5, roughness: 0.38 });
  const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
  shaft.position.y = -(length + headLength) / 2;
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = -headLength / 2;
  return {
    meshes: [shaft, head],
    dispose() {
      shaftGeometry.dispose();
      headGeometry.dispose();
      shaftMaterial.dispose();
      headMaterial.dispose();
    },
  };
}

type EntryContent =
  | { kind: "model"; draw: EngineDraw; state: EngineFrameState }
  | { kind: "shaft"; shaft: ReturnType<typeof buildShaft> }
  | { kind: "none" };

interface ProjectileEntry {
  flight: LiveProjectile;
  group: THREE.Group;
  content: EntryContent;
  model: ModelConfig | undefined;
  fallback: ProjectileShaft | undefined;
}

const EMPTY_CONTENT: EntryContent = { kind: "none" };

/**
 * Mount caller-owned models at authoritative projectile positions. Flight ids
 * determine lifetime; each frame only updates transforms, and settlement removes
 * the model. Optional shaft/head geometry is enabled only by the caller.
 * @capability projectile-models render authoritative projectile flights with caller models or opt-in shaft/head geometry, velocity orientation, bounded instances, and settlement cleanup
 * @internal
 */
export function projectileModelsDraw(getProps: () => ProjectileModelsProps, ctx: GameContext | null): EngineDraw {
  const sceneGroup = new THREE.Group();
  const entries = new Map<string, ProjectileEntry>();
  const seen = new Set<string>();
  const direction = new THREE.Vector3();
  const nose = new THREE.Vector3(0, 1, 0);
  let forwardFor: readonly [number, number, number] | undefined;

  const selectModel = (props: ProjectileModelsProps, flight: LiveProjectile): ModelConfig | undefined =>
    typeof props.model === "function" ? props.model(flight) : props.model;

  const teardownContent = (entry: ProjectileEntry) => {
    if (entry.content.kind === "model") entry.content.draw.dispose?.(entry.content.state);
    else if (entry.content.kind === "shaft") entry.content.shaft.dispose();
    entry.content = EMPTY_CONTENT;
    entry.group.clear();
  };

  const ensureContent = (entry: ProjectileEntry, props: ProjectileModelsProps, state: EngineFrameState) => {
    const selected = selectModel(props, entry.flight);
    if (selected !== entry.model) {
      teardownContent(entry);
      entry.model = selected;
      entry.fallback = undefined;
      if (selected !== undefined) {
        const draw = isolatedEntityModelDraw({ model: selected, instanceId: undefined, ctx });
        const childState = childFrameState(state, entry.group);
        draw.mount?.(childState);
        entry.content = { kind: "model", draw, state: childState };
      } else if (props.fallback !== undefined) {
        const shaft = buildShaft(props.fallback);
        for (const mesh of shaft.meshes) entry.group.add(mesh);
        entry.content = { kind: "shaft", shaft };
        entry.fallback = props.fallback;
      }
      return;
    }
    if (selected === undefined && entry.fallback !== props.fallback) {
      teardownContent(entry);
      entry.model = undefined;
      if (props.fallback !== undefined) {
        const shaft = buildShaft(props.fallback);
        for (const mesh of shaft.meshes) entry.group.add(mesh);
        entry.content = { kind: "shaft", shaft };
        entry.fallback = props.fallback;
      }
    }
  };

  return {
    mount(state: EngineFrameState) {
      state.scene.add(sceneGroup);
    },
    frame(state: EngineFrameState) {
      const props = getProps();
      if (props.forward !== forwardFor) {
        forwardFor = props.forward;
        nose.set(...(props.forward ?? [0, 1, 0])).normalize();
        if (nose.lengthSq() === 0) nose.set(0, 1, 0);
      }
      const limit = Number.isFinite(props.maxInstances) ? Math.max(0, Math.min(1024, Math.floor(props.maxInstances ?? 256))) : 256;
      const live = props.source?.() ?? ctx?.scene.entity.activeProjectiles() ?? [];
      seen.clear();
      for (let i = 0, n = Math.min(limit, live.length); i < n; i += 1) {
        const flight = live[i]!;
        const key = `${flight.shotId}:${flight.pellet}`;
        seen.add(key);
        let entry = entries.get(key);
        if (entry === undefined) {
          entry = { flight, group: new THREE.Group(), content: EMPTY_CONTENT, model: undefined, fallback: undefined };
          sceneGroup.add(entry.group);
          entries.set(key, entry);
        } else {
          entry.flight = flight;
        }
        ensureContent(entry, props, state);
      }
      for (const key of entries.keys()) {
        if (seen.has(key)) continue;
        const entry = entries.get(key);
        if (entry !== undefined) {
          teardownContent(entry);
          sceneGroup.remove(entry.group);
        }
        entries.delete(key);
      }
      for (const entry of entries.values()) applyProjectilePose(entry.group, entry.flight, nose, direction);
      for (const entry of entries.values()) {
        if (entry.content.kind === "model") entry.content.draw.frame?.(entry.content.state, entry.content.state.delta);
      }
    },
    update(state: EngineFrameState) {
      this.frame?.(state, state.delta);
    },
    dispose(state: EngineFrameState) {
      for (const entry of entries.values()) {
        teardownContent(entry);
        sceneGroup.remove(entry.group);
      }
      entries.clear();
      state.scene.remove(sceneGroup);
      sceneGroup.clear();
    },
  };
}

/**
 * Mount caller-owned models at authoritative projectile positions. Flight ids
 * determine lifetime; each frame only updates transforms, and settlement removes
 * the model. Optional shaft/head geometry is enabled only by the caller.
 * @capability projectile-models render authoritative projectile flights with caller models or opt-in shaft/head geometry, velocity orientation, bounded instances, and settlement cleanup
 */
export function ProjectileModels(props: ProjectileModelsProps) {
  const ctx = useGameContext();
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => projectileModelsDraw(() => latest.current, ctx), [ctx]);
  return null;
}

import { useFrame } from "@react-three/fiber";
import { useRef, useState, type ReactElement } from "react";
import * as THREE from "three";

import type { LiveProjectile } from "@jgengine/core/combat/projectiles";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { useGameContext } from "@jgengine/react/provider";

import { IsolatedEntityModel } from "../render/SceneModels";

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

function Shaft({ length = 0.85, radius = 0.012, shaftColor = "#947044", headColor = "#b9c4d0" }: ProjectileShaft): ReactElement {
  const headLength = length * 0.18;
  return <>
    <mesh position={[0, -(length + headLength) / 2, 0]}>
      <cylinderGeometry args={[radius, radius, length - headLength, 6]} />
      <meshStandardMaterial color={shaftColor} roughness={0.78} />
    </mesh>
    <mesh position={[0, -headLength / 2, 0]}>
      <coneGeometry args={[radius * 3.5, headLength, 6]} />
      <meshStandardMaterial color={headColor} metalness={0.5} roughness={0.38} />
    </mesh>
  </>;
}

/**
 * Mount caller-owned models at authoritative projectile positions. Flight ids
 * determine lifetime; each frame only updates transforms, and settlement removes
 * the model. Optional shaft/head geometry is enabled only by the caller.
 * @capability projectile-models render authoritative projectile flights with caller models or opt-in shaft/head geometry, velocity orientation, bounded instances, and settlement cleanup
 */
export function ProjectileModels({ model, fallback, forward = [0, 1, 0], maxInstances = 256, source }: ProjectileModelsProps): ReactElement {
  const ctx = useGameContext();
  const entries = useRef(new Map<string, { flight: LiveProjectile; group: THREE.Group | null }>());
  const seen = useRef(new Set<string>());
  const direction = useRef(new THREE.Vector3());
  const nose = useRef(new THREE.Vector3());
  const [, setGeneration] = useState(0);
  nose.current.set(...forward).normalize();
  if (nose.current.lengthSq() === 0) nose.current.set(0, 1, 0);
  const limit = Number.isFinite(maxInstances) ? Math.max(0, Math.min(1024, Math.floor(maxInstances))) : 256;

  useFrame(() => {
    let changed = false;
    const live = source?.() ?? ctx.scene.entity.activeProjectiles();
    seen.current.clear();
    for (let i = 0, n = Math.min(limit, live.length); i < n; i++) {
      const flight = live[i]!;
      const key = `${flight.shotId}:${flight.pellet}`;
      seen.current.add(key);
      const current = entries.current.get(key);
      if (current === undefined) { entries.current.set(key, { flight, group: null }); changed = true; }
      else {
        current.flight = flight;
        if (current.group !== null) applyProjectilePose(current.group, flight, nose.current, direction.current);
      }
    }
    for (const key of entries.current.keys()) if (!seen.current.has(key)) { entries.current.delete(key); changed = true; }
    if (changed) setGeneration((n) => n + 1);
  });

  return <>{Array.from(entries.current, ([key, entry]) => {
    const selected = typeof model === "function" ? model(entry.flight) : model;
    return <group key={key} ref={(group) => {
      entry.group = group;
      if (group !== null) applyProjectilePose(group, entry.flight, nose.current, direction.current);
    }}>
      {selected === undefined ? fallback === undefined ? null : <Shaft {...fallback} /> : <IsolatedEntityModel model={selected} instanceId={key} />}
    </group>;
  })}</>;
}

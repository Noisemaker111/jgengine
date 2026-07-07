import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { PhysicsWorld } from "@jgengine/core/physics/physicsWorld";

export interface InstancedBodiesProps {
  /** Physics world whose SoA buffers are streamed straight into the instance matrix. */
  world: PhysicsWorld;
  /** When true, color each instance by simulation state (sleeping / awake / contact) instead of its base color. */
  debugTint?: boolean;
  /** Per-body base RGB (length ≥ capacity·3), used when debugTint is off. Defaults to flat gray. */
  baseColors?: Float32Array;
  /** Bump to force a color re-upload after the world is rebuilt (e.g. reset). */
  epoch?: number;
}

const SLEEPING_COLOR = new THREE.Color(0.32, 0.4, 0.62);
const AWAKE_COLOR = new THREE.Color(0.45, 0.78, 0.5);
const CONTACT_COLOR = new THREE.Color(0.96, 0.55, 0.18);
const DEFAULT_BASE = new THREE.Color(0.62, 0.64, 0.68);

/**
 * Renders a PhysicsWorld's box bodies as a single InstancedMesh — one draw call per batch.
 * Transforms are written directly into `instanceMatrix.array` each frame (bodies never touch
 * the per-entity React path). Reusable by any game: hand it a physics world and go.
 */
export function InstancedBodies({ world, debugTint = false, baseColors, epoch = 0 }: InstancedBodiesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, vertexColors: false }),
    [],
  );
  const capacity = world.capacity;

  const instanceColor = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
    [capacity],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    mesh.instanceColor = instanceColor;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instanceColor.setUsage(THREE.DynamicDrawUsage);
  }, [instanceColor]);

  const lastTintRef = useRef<boolean | null>(null);
  useEffect(() => {
    lastTintRef.current = null;
  }, [epoch, debugTint]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const count = world.count;
    mesh.count = count;

    const m = mesh.instanceMatrix.array as Float32Array;
    const { posX, posY, posZ, halfX, halfY, halfZ } = world;
    for (let i = 0; i < count; i += 1) {
      const o = i * 16;
      m[o] = halfX[i]! * 2;
      m[o + 5] = halfY[i]! * 2;
      m[o + 10] = halfZ[i]! * 2;
      m[o + 12] = posX[i]!;
      m[o + 13] = posY[i]!;
      m[o + 14] = posZ[i]!;
      m[o + 15] = 1;
    }
    mesh.instanceMatrix.needsUpdate = true;

    const c = instanceColor.array as Float32Array;
    if (debugTint) {
      const { contact } = world;
      for (let i = 0; i < count; i += 1) {
        const col = contact[i] !== 0 ? CONTACT_COLOR : world.isSleeping(i) ? SLEEPING_COLOR : AWAKE_COLOR;
        const o = i * 3;
        c[o] = col.r;
        c[o + 1] = col.g;
        c[o + 2] = col.b;
      }
      instanceColor.needsUpdate = true;
    } else if (lastTintRef.current !== false) {
      if (baseColors !== undefined) {
        c.set(baseColors.subarray(0, capacity * 3));
      } else {
        for (let i = 0; i < capacity; i += 1) {
          const o = i * 3;
          c[o] = DEFAULT_BASE.r;
          c[o + 1] = DEFAULT_BASE.g;
          c[o + 2] = DEFAULT_BASE.b;
        }
      }
      instanceColor.needsUpdate = true;
    }
    lastTintRef.current = debugTint;
  });

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, capacity]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  );
}

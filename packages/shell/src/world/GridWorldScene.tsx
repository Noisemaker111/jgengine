import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { WorldFeature } from "@jgengine/core/world/features";
import { resolveGridInstances } from "@jgengine/core/world/gridInstances";

import { useDisposable } from "../render/useDisposable";

export interface GridWorldSceneProps {
  feature: WorldFeature;
}

type GridWorldFeature = Extract<WorldFeature, { kind: "biomes" | "voxel" | "plots" | "tilemap" }>;

function isGridWorldFeature(feature: WorldFeature): feature is GridWorldFeature {
  return (
    feature.kind === "biomes" || feature.kind === "voxel" || feature.kind === "plots" || feature.kind === "tilemap"
  );
}

/**
 * Data-driven renderer for the `biomes()`/`voxel()`/`plots()`/`tilemap()` world-feature kinds
 * (#207.1): one `InstancedMesh` of extruded, colored boxes built from each feature's declared
 * `cells`, following the same direct-buffer pattern as `InstancedBodies`.
 */
export function GridWorldScene({ feature }: GridWorldSceneProps) {
  const instances = useMemo(
    () => (isGridWorldFeature(feature) ? resolveGridInstances(feature) : []),
    [feature],
  );

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useDisposable(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useDisposable(() => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }), []);
  const instanceColor = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(Math.max(instances.length, 1) * 3), 3),
    [instances.length],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    mesh.instanceColor = instanceColor;
    mesh.count = instances.length;

    const m = mesh.instanceMatrix.array as Float32Array;
    const c = instanceColor.array as Float32Array;
    const color = new THREE.Color();
    for (let i = 0; i < instances.length; i += 1) {
      const instance = instances[i]!;
      const o = i * 16;
      m[o] = instance.scale[0];
      m[o + 5] = instance.scale[1];
      m[o + 10] = instance.scale[2];
      m[o + 12] = instance.position[0];
      m[o + 13] = instance.position[1];
      m[o + 14] = instance.position[2];
      m[o + 15] = 1;

      color.set(instance.color);
      const co = i * 3;
      c[co] = color.r;
      c[co + 1] = color.g;
      c[co + 2] = color.b;
    }
    mesh.instanceMatrix.needsUpdate = true;
    instanceColor.needsUpdate = true;
  }, [instances, instanceColor]);

  if (instances.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[geometry, material, instances.length]} castShadow receiveShadow />
  );
}

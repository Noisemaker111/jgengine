import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { WorldFeature } from "@jgengine/core/world/features";
import { resolveGridInstances } from "@jgengine/core/world/gridInstances";

import { composeInstance, uploadInstances } from "../instancing/instanceUpload";
import { useDisposable } from "../render/useDisposable";
import { TileLayerRenderer } from "./TileLayerRenderer";

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
 * `cells`, uploaded through the shared instance upload.
 */
export function GridWorldScene({ feature }: GridWorldSceneProps) {
  if (feature.kind === "tilemap" && feature.tileSet !== undefined) {
    return <TileLayerRenderer config={feature} />;
  }
  const instances = useMemo(
    () => (isGridWorldFeature(feature) ? resolveGridInstances(feature) : []),
    [feature],
  );

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useDisposable(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useDisposable(() => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }), []);
  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    uploadInstances(
      mesh,
      { count: instances.length, at: (i, out) => composeInstance(out, instances[i]!.position, undefined, instances[i]!.scale) },
      { colors: (i, out) => out.set(instances[i]!.color) },
    );
  }, [instances]);

  if (instances.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[geometry, material, instances.length]} castShadow receiveShadow />
  );
}

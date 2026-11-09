import { useMemo } from "react";
import * as THREE from "three";

import type { WorldFeature } from "@jgengine/core/world/features";
import { resolveGridInstances } from "@jgengine/core/world/gridInstances";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { composeInstance, uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { TileLayerRenderer } from "@jgengine/core/render/TileLayerRenderer.draw";

export interface GridWorldSceneProps {
  feature: WorldFeature;
}

type GridWorldFeature = Extract<WorldFeature, { kind: "biomes" | "voxel" | "plots" | "tilemap" }>;

function isGridWorldFeature(feature: WorldFeature): feature is GridWorldFeature {
  return (
    feature.kind === "biomes" || feature.kind === "voxel" || feature.kind === "plots" || feature.kind === "tilemap"
  );
}

function gridWorldDraw(instances: ReturnType<typeof resolveGridInstances>): EngineDraw {
  let mesh: THREE.InstancedMesh | null = null;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  return {
    mount(state: EngineFrameState) {
      if (instances.length === 0) return;
      mesh = new THREE.InstancedMesh(geometry, material, instances.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      uploadInstances(
        mesh,
        { count: instances.length, at: (i, out) => composeInstance(out, instances[i]!.position, undefined, instances[i]!.scale) },
        { colors: (i, out) => out.set(instances[i]!.color) },
      );
      state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) state.scene.remove(mesh);
      mesh?.dispose();
      mesh = null;
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Data-driven renderer for the `biomes()`/`voxel()`/`plots()`/`tilemap()` world-feature kinds
 * (#207.1): one `InstancedMesh` of extruded, colored boxes built from each feature's declared
 * `cells`, uploaded through the shared instance upload.
 */
export function GridWorldScene({ feature }: GridWorldSceneProps) {
  const tilemap = feature.kind === "tilemap" && feature.tileSet !== undefined;
  const instances = useMemo(
    () => (!tilemap && isGridWorldFeature(feature) ? resolveGridInstances(feature) : []),
    [feature, tilemap],
  );
  useEngineDraw(() => gridWorldDraw(instances), [instances]);
  if (tilemap) {
    return <TileLayerRenderer config={feature} />;
  }
  return null;
}

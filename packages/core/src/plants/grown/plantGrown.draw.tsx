import { useRef } from "react";
import * as THREE from "three";

import { prepareGenerator, runGenerator } from "@jgengine/core/generator/generator";
import { registerGeneratorMesh } from "@jgengine/core/generator/generatorMesh.draw";
import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { childFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { loadDraw } from "@jgengine/core/frame/loadDraw.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";
import { isPlantMesh, type PlantMesh } from "../mesh/plantMesh";
import { plantMeshSources } from "../mesh/plantMesh.draw";
import { PLANT_MESH_OUTPUT } from "./plantGrown";

/** Variant tiles draw the shoot-card level: a whole grid of plants stays cheap. */
const PREVIEW_DETAIL = 0.5;

/** Meshes of tiles already grown, so a tile's camera frame fits the plant once it exists. */
const previewMeshes = new Map<string, PlantMesh>();

function previewKey({ definition, variant }: GeneratorPreviewProps): string {
  return `${definition.id}:${JSON.stringify(variant.meta)}`;
}

function plantPreviewDraw(props: GeneratorPreviewProps): EngineDraw {
  const { definition, variant } = props;
  const key = previewKey(props);
  const geometries: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();
  let ground: THREE.Mesh | null = null;
  let innerState: EngineFrameState | null = null;
  const inner = loadDraw<PlantMesh | null>({
    key: `plant-preview:${key}`,
    load: () => {
      const done = trackSceneWork(`plant-preview:${key}`);
      return prepareGenerator(definition, variant.meta, { detail: PREVIEW_DETAIL })
        .then(() => {
          const output = runGenerator(definition, variant.meta, { detail: PREVIEW_DETAIL });
          if (!isPlantMesh(output)) return null;
          previewMeshes.set(key, output);
          return output;
        })
        .catch((error: unknown) => {
          console.error("[jgengine] plant preview failed to grow", error);
          return null;
        })
        .finally(done);
    },
    build: (mesh, parent) => {
      if (mesh === null) return;
      const radius = Math.max(1, mesh.stats.crownRadiusM * 1.4);
      if (ground !== null) {
        ground.geometry.dispose();
        const next = new THREE.CircleGeometry(radius, 24);
        geometries.push(next);
        ground.geometry = next;
      }
      for (const source of plantMeshSources(mesh)) {
        geometries.push(source.geometry);
        const item = new THREE.Mesh(source.geometry, source.material);
        item.castShadow = true;
        item.receiveShadow = true;
        parent.add(item);
      }
    },
  });
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      const groundGeometry = new THREE.CircleGeometry(1, 24);
      geometries.push(groundGeometry);
      ground = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ color: "#5a4b38", roughness: 1 }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.01;
      ground.receiveShadow = true;
      group.add(ground);
      innerState = childFrameState(state, group);
      inner.mount?.(innerState);
    },
    frame(_state: EngineFrameState) {
      if (innerState !== null) inner.frame?.(innerState, innerState.delta);
    },
    dispose(state: EngineFrameState) {
      if (innerState !== null) inner.dispose?.(innerState);
      state.scene.remove(group);
      for (const geometry of geometries) geometry.dispose();
    },
  };
}

function PlantPreview(props: GeneratorPreviewProps) {
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => plantPreviewDraw(latest.current), [previewKey(props)]);
  return null;
}

/** Registers the grown-plant instanced mesh builder and variant-tile preview. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerPlantDraw(): void {
  registerGeneratorMesh(PLANT_MESH_OUTPUT, (output) => (isPlantMesh(output) ? plantMeshSources(output) : null));
  registerGeneratorPreview(PLANT_MESH_OUTPUT, {
    Component: PlantPreview,
    frame: (props) => {
      const mesh = previewMeshes.get(previewKey(props));
      if (mesh === undefined) {
        const age = typeof props.variant.meta["age"] === "number" ? props.variant.meta["age"] : 60;
        const height = Math.max(1, Math.min(30, age * 0.35));
        return { target: [0, height / 2, 0], distance: height * 1.8 };
      }
      const { min, max } = mesh.bounds;
      const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.2);
      return { target: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], distance: extent * 1.5 };
    },
  });
}

import { useEffect, useMemo, useState } from "react";

import { prepareGenerator, runGenerator } from "@jgengine/core/generator/generator";
import { registerGeneratorMesh } from "@jgengine/core/generator/generatorMesh.draw";
import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
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

function PlantPreview(props: GeneratorPreviewProps) {
  const { definition, variant } = props;
  const key = previewKey(props);
  const [mesh, setMesh] = useState<PlantMesh | null>(() => previewMeshes.get(key) ?? null);
  useEffect(() => {
    let live = true;
    const done = trackSceneWork(`plant-preview:${key}`);
    prepareGenerator(definition, variant.meta, { detail: PREVIEW_DETAIL })
      .then(() => {
        const output = runGenerator(definition, variant.meta, { detail: PREVIEW_DETAIL });
        if (!isPlantMesh(output)) return;
        previewMeshes.set(key, output);
        if (live) setMesh(output);
      })
      .catch((error: unknown) => console.error("[jgengine] plant preview failed to grow", error))
      .finally(done);
    return () => {
      live = false;
    };
  }, [definition, variant, key]);
  const sources = useMemo(() => (mesh === null ? [] : plantMeshSources(mesh)), [mesh]);
  useEffect(() => () => sources.forEach((source) => source.geometry.dispose()), [sources]);
  const groundRadius = mesh === null ? 1 : Math.max(1, mesh.stats.crownRadiusM * 1.4);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[groundRadius, 24]} />
        <meshStandardMaterial color="#5a4b38" roughness={1} />
      </mesh>
      {sources.map((source, index) => (
        <mesh key={index} geometry={source.geometry} material={source.material} castShadow receiveShadow />
      ))}
    </>
  );
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

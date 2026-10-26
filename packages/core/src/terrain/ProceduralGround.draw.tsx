import { type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";

import { useDisposable } from "@jgengine/shell/render/useDisposable";
import { createProceduralGroundGeometry, type ProceduralTerrainConfig, type TerrainVertexColorOptions } from "./terrainMath.draw";

/** Props for {@link ProceduralGround}: noise terrain settings, height colours and material settings. */
export interface ProceduralGroundProps extends Omit<ThreeElements["mesh"], "args" | "children" | "geometry" | "material"> {
  terrain?: ProceduralTerrainConfig;
  colors?: TerrainVertexColorOptions;
  roughness?: number;
  metalness?: number;
}

/** A seeded noise-height ground mesh coloured from low to high ground.
 * @capability procedural-ground seeded noise-height ground mesh with low/high/waterline vertex colours for quick natural scenes */
export function ProceduralGround({
  terrain,
  colors,
  roughness = 0.94,
  metalness = 0,
  receiveShadow = true,
  ...meshProps
}: ProceduralGroundProps) {
  const geometry = useDisposable(() => createProceduralGroundGeometry(terrain, colors), [colors, terrain]);
  const material = useDisposable(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness,
        metalness,
        vertexColors: true,
      }),
    [metalness, roughness],
  );

  return <mesh {...meshProps} geometry={geometry} material={material} receiveShadow={receiveShadow} />;
}

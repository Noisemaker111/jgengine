import { type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";

import { useDisposable } from "../render/useDisposable";
import { createProceduralGroundGeometry, type ProceduralTerrainConfig, type TerrainVertexColorOptions } from "./terrainMath";

export interface ProceduralGroundProps extends Omit<ThreeElements["mesh"], "args" | "children" | "geometry" | "material"> {
  terrain?: ProceduralTerrainConfig;
  colors?: TerrainVertexColorOptions;
  roughness?: number;
  metalness?: number;
}

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

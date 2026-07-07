import { type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

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
  const geometry = useMemo(() => createProceduralGroundGeometry(terrain, colors), [colors, terrain]);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness,
        metalness,
        vertexColors: true,
      }),
    [metalness, roughness],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return <mesh {...meshProps} geometry={geometry} material={material} receiveShadow={receiveShadow} />;
}

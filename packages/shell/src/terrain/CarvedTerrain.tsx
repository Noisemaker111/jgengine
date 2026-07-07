import { type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { TerrainField } from "@jgengine/core/world/terrain";

import { createFieldGroundGeometry, type FieldGroundOptions } from "./terrainMath";

export interface CarvedTerrainProps extends Omit<ThreeElements["mesh"], "args" | "children" | "geometry" | "material"> {
  /** The terrain field to mesh — a `CarvableField` renders its craters and mounds. */
  field: TerrainField;
  size?: FieldGroundOptions["size"];
  segments?: FieldGroundOptions["segments"];
  center?: FieldGroundOptions["center"];
  colors?: FieldGroundOptions["colors"];
  heightRange?: FieldGroundOptions["heightRange"];
  roughness?: number;
  metalness?: number;
  /** Bump after a runtime carve/deposit to re-mesh the deformed surface. */
  epoch?: number;
}

/**
 * Renders a `TerrainField` as a deformed ground mesh — the crater/mound view for destructible terrain.
 * Because the geometry samples `field.sampleHeight`, a `CarvableField.carve(...)` shows as a real bowl
 * once `epoch` changes. Pair with `InstancedBodies` to see debris resting in the crater it blasted.
 */
export function CarvedTerrain({
  field,
  size,
  segments,
  center,
  colors,
  heightRange,
  roughness = 0.95,
  metalness = 0,
  receiveShadow = true,
  epoch = 0,
  ...meshProps
}: CarvedTerrainProps) {
  const geometry = useMemo(
    () => createFieldGroundGeometry(field, { size, segments, center, colors, heightRange }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [field, size, segments, center, colors, heightRange, epoch],
  );
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness, metalness, vertexColors: true }),
    [metalness, roughness],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return <mesh {...meshProps} geometry={geometry} material={material} receiveShadow={receiveShadow} />;
}

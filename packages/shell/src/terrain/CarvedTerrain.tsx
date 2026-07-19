import { type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";

import type { TerrainField } from "@jgengine/core/world/terrain";

import { useDisposable } from "../render/useDisposable";
import { createFieldGroundGeometry, type FieldGroundOptions } from "./terrainMath";

export interface CarvedTerrainProps extends Omit<ThreeElements["mesh"], "args" | "children" | "geometry" | "material"> {
  /** The terrain field to mesh — a `CarvableField` renders its craters and mounds. */
  field: TerrainField;
  size?: FieldGroundOptions["size"];
  segments?: FieldGroundOptions["segments"];
  center?: FieldGroundOptions["center"];
  colors?: FieldGroundOptions["colors"];
  heightRange?: FieldGroundOptions["heightRange"];
  paletteAt?: FieldGroundOptions["paletteAt"];
  roughness?: number;
  metalness?: number;
  /** Override the default vertex-colour material (e.g. a procedural detail material). The caller owns its lifecycle; it is not disposed here. */
  surfaceMaterial?: THREE.Material;
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
  paletteAt,
  roughness = 0.95,
  metalness = 0,
  surfaceMaterial,
  receiveShadow = true,
  epoch = 0,
  ...meshProps
}: CarvedTerrainProps) {
  const geometry = useDisposable(
    () => createFieldGroundGeometry(field, { size, segments, center, colors, heightRange, paletteAt }),
    [field, size, segments, center, colors, heightRange, paletteAt, epoch],
  );
  const defaultMaterial = useDisposable(
    () => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness, metalness, vertexColors: true }),
    [metalness, roughness],
  );
  const material = surfaceMaterial ?? defaultMaterial;

  return <mesh {...meshProps} geometry={geometry} material={material} receiveShadow={receiveShadow} />;
}

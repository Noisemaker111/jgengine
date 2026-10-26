import { type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";

import type { TerrainField } from "@jgengine/core/world/terrain";

import { useDisposable } from "../render/useDisposable";
import { useSlicedValue } from "../render/useSlicedValue";
import { fieldGroundGeometryJob, type FieldGroundOptions } from "./terrainMath";

export interface CarvedTerrainProps extends Omit<ThreeElements["mesh"], "args" | "children" | "geometry" | "material"> {
  /** The terrain field to mesh — a `CarvableField` renders its craters and mounds. */
  field: TerrainField;
  size?: FieldGroundOptions["size"];
  segments?: FieldGroundOptions["segments"];
  center?: FieldGroundOptions["center"];
  colors?: FieldGroundOptions["colors"];
  heightRange?: FieldGroundOptions["heightRange"];
  paletteAt?: FieldGroundOptions["paletteAt"];
  paintColorAt?: FieldGroundOptions["paintColorAt"];
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
  paintColorAt,
  roughness = 0.95,
  metalness = 0,
  surfaceMaterial,
  receiveShadow = true,
  epoch = 0,
  ...meshProps
}: CarvedTerrainProps) {
  // Meshed in slices after mount: a big field samples the game's height function hundreds of
  // thousands of times, which inside render froze the page (and the menu over it) for seconds.
  // The previous mesh stays up while a carve re-meshes.
  const geometry = useSlicedValue(
    "terrain",
    () => fieldGroundGeometryJob(field, { size, segments, center, colors, heightRange, paletteAt, paintColorAt }),
    [field, size, segments, center, colors, heightRange, paletteAt, paintColorAt, epoch],
  );
  useDisposable(() => geometry ?? [], [geometry]);
  const defaultMaterial = useDisposable(
    () => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness, metalness, vertexColors: true }),
    [metalness, roughness],
  );
  const material = surfaceMaterial ?? defaultMaterial;

  // Until the mesh is built, a stand-in with its vertex layout and a single zero-area triangle
  // holds its place: the shader warmup links and draws the ground's program (one of the largest a
  // scene has) while the build runs, instead of starting only once the mesh lands.
  return <mesh {...meshProps} geometry={geometry ?? terrainStandIn()} material={material} receiveShadow={receiveShadow} />;
}

let standIn: THREE.BufferGeometry | null = null;

/** The ground mesh's attribute layout (see `groundGeometryJob`) on one degenerate triangle; shared, never disposed. */
function terrainStandIn(): THREE.BufferGeometry {
  if (standIn !== null) return standIn;
  standIn = new THREE.BufferGeometry();
  standIn.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
  standIn.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(6), 2));
  standIn.setAttribute("color", new THREE.BufferAttribute(new Float32Array(9).fill(1), 3));
  standIn.setAttribute("normal", new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  standIn.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 1, 2]), 1));
  standIn.computeBoundingSphere();
  return standIn;
}

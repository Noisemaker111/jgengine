import { type ThreeElements, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { runSliced, type SlicedRun } from "@jgengine/core/run/slicedWork";

import type { TerrainField } from "@jgengine/core/terrain/terrain";

import { useDisposable } from "@jgengine/core/render/useDisposable.draw";
import { useSlicedValue } from "@jgengine/core/render/useSlicedValue.draw";
import { CHUNKED_GROUND_MIN_VERTICES, GroundChunks } from "./terrainChunks.draw";
import { fieldGroundGeometryJob, resolveFieldGroundGrid, type FieldGroundOptions } from "./terrainMath.draw";

/** Props for `CarvedTerrain`: the terrain field to mesh, its size, resolution, colouring and material settings. */
export interface CarvedTerrainProps extends Omit<ThreeElements["mesh"], "args" | "children" | "geometry" | "material"> {
  /** The terrain field to mesh — a `CarvableField` renders its craters and mounds. */
  field: TerrainField;
  size?: FieldGroundOptions["size"];
  segments?: FieldGroundOptions["segments"] | undefined;
  center?: FieldGroundOptions["center"] | undefined;
  colors?: FieldGroundOptions["colors"];
  heightRange?: FieldGroundOptions["heightRange"];
  paletteAt?: FieldGroundOptions["paletteAt"] | undefined;
  paintColorAt?: FieldGroundOptions["paintColorAt"] | undefined;
  roughness?: number;
  metalness?: number;
  /** Override the default vertex-colour material (e.g. a procedural detail material). The caller owns its lifecycle; it is not disposed here. */
  surfaceMaterial?: THREE.Material | undefined;
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
  const defaultMaterial = useDisposable(
    () => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness, metalness, vertexColors: true }),
    [metalness, roughness],
  );
  const material = surfaceMaterial ?? defaultMaterial;
  const grid = useMemo(
    () => resolveFieldGroundGrid(field, { size, segments, center, colors, heightRange, paletteAt, paintColorAt }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [field, size, segments, center, colors, heightRange, paletteAt, paintColorAt, epoch],
  );
  const chunked = (grid.segments.x + 1) * (grid.segments.z + 1) > CHUNKED_GROUND_MIN_VERTICES;
  if (chunked) return <ChunkedGround grid={grid} material={material} receiveShadow={receiveShadow} meshProps={meshProps} />;
  return <WholeGround field={field} options={{ size, segments, center, colors, heightRange, paletteAt, paintColorAt }} epoch={epoch} material={material} receiveShadow={receiveShadow} meshProps={meshProps} />;
}

function WholeGround({
  field,
  options,
  epoch,
  material,
  receiveShadow,
  meshProps,
}: {
  field: TerrainField;
  options: FieldGroundOptions;
  epoch: number;
  material: THREE.Material;
  receiveShadow: boolean;
  meshProps: Omit<CarvedTerrainProps, "field">;
}) {
  // Meshed in slices after mount: a big field samples the game's height function hundreds of
  // thousands of times, which inside render froze the page (and the menu over it) for seconds.
  // The previous mesh stays up while a carve re-meshes.
  const { size, segments, center, colors, heightRange, paletteAt, paintColorAt } = options;
  const geometry = useSlicedValue(
    "terrain",
    () => fieldGroundGeometryJob(field, options),
    [field, size, segments, center, colors, heightRange, paletteAt, paintColorAt, epoch],
  );
  useDisposable(() => geometry ?? [], [geometry]);

  // Until the mesh is built, a stand-in with its vertex layout and a single zero-area triangle
  // holds its place: the shader warmup links and draws the ground's program (one of the largest a
  // scene has) while the build runs, instead of starting only once the mesh lands.
  return <mesh {...meshProps} geometry={geometry ?? terrainStandIn()} material={material} receiveShadow={receiveShadow} />;
}

/** Seconds between checks for a tile level the camera now needs. */
const REFINE_INTERVAL = 0.25;

/**
 * A ground too big for one mesh, drawn as {@link GroundChunks} LOD tiles. Scene loading waits for
 * the coarse cover plus the tiles around the camera; finer tiles stream in afterwards in small
 * slices as the camera approaches them, so they never count against the scene being ready.
 */
function ChunkedGround({
  grid,
  material,
  receiveShadow,
  meshProps,
}: {
  grid: ReturnType<typeof resolveFieldGroundGrid>;
  material: THREE.Material;
  receiveShadow: boolean;
  meshProps: Omit<CarvedTerrainProps, "field">;
}) {
  const camera = useThree((state) => state.camera);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const chunks = useMemo(() => new GroundChunks(grid, material, receiveShadow), [grid, material, receiveShadow]);
  useEffect(() => () => chunks.dispose(), [chunks]);
  const ready = useSlicedValue("terrain", () => wrapInitial(chunks, () => cameraRef.current.getWorldPosition(new THREE.Vector3())), [chunks]);
  const refining = useRef<SlicedRun<void> | null>(null);
  const sinceCheck = useRef(0);
  useEffect(
    () => () => {
      refining.current?.cancel();
      refining.current = null;
    },
    [chunks],
  );
  useFrame((state, delta) => {
    if (ready !== chunks || refining.current !== null) return;
    sinceCheck.current += delta;
    if (sinceCheck.current < REFINE_INTERVAL) return;
    sinceCheck.current = 0;
    const job = chunks.nextRefinement(state.camera.getWorldPosition(eyeScratch));
    if (job === null) return;
    const run = runSliced(job, { budgetMs: 3 });
    refining.current = run;
    run.done.then(
      () => {
        if (refining.current === run) refining.current = null;
      },
      () => {
        if (refining.current === run) refining.current = null;
      },
    );
  });
  const { position, rotation, scale, visible } = meshProps;
  return (
    <>
      <primitive object={chunks.root} position={position} rotation={rotation} scale={scale} visible={visible} />
      {/* Holds the ground's program in the warmup while the first tiles build (see WholeGround). */}
      {ready === chunks ? null : <mesh geometry={terrainStandIn()} material={material} receiveShadow={receiveShadow} />}
    </>
  );
}

const eyeScratch = new THREE.Vector3();

function* wrapInitial(chunks: GroundChunks, eye: () => THREE.Vector3) {
  yield* chunks.initialJob(eye);
  return chunks;
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

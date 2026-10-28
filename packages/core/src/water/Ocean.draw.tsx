// @skill jgengine-world
import { useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useOptionalGameContext } from "@jgengine/react/provider";

import type { SlicedJob } from "@jgengine/core/run/slicedWork";
import { useDisposable } from "@jgengine/core/render/useDisposable.draw";
import { useSlicedValue } from "@jgengine/core/render/useSlicedValue.draw";
import { readSkyLight } from "@jgengine/core/sky/skyLight.draw";
import { createOceanConfig, oceanBedResolution, type OceanConfig, type ResolvedOceanConfig } from "./OceanConfig.draw";
import { createOceanMaterial, deepBedTexture, syncOceanMaterial } from "./OceanMaterial.draw";
import type { OceanBedBounds } from "./oceanBed";

/** Props for {@link Ocean}: the ocean config, the ground under it, and mesh props. */
export interface OceanProps extends Omit<ThreeElements["mesh"], "args" | "children" | "geometry" | "material"> {
  config?: OceanConfig;
  /**
   * World height of the ground under a point given in the sheet's local XZ. When provided, it is baked
   * once (in slices, behind the loading cover) into a bed map the shader reads per pixel: depth colour,
   * clear shallows, shore foam and wave damping follow the real bed, and keep following it when the
   * surface rises or falls. Omit for open sea (everywhere deep).
   */
  bedAt?: (x: number, z: number) => number;
  /** The local rect the bed map covers. Default the sheet. Outside it the water counts as deep. */
  bedBounds?: OceanBedBounds;
}

/** Fraction of the follow grid's half-width used at the centre: vertices pack near the camera. */
const FOLLOW_CENTRE_SHARE = 0.05;

/**
 * A square grid `2 * half` wide whose vertices pack toward the centre (spacing grows with the cube of
 * the distance), for a sheet that follows the camera: dense where waves are seen up close, sparse out
 * to the horizon. Returns the geometry and its centre vertex spacing.
 * @internal
 */
export function createFollowGeometry(half: number, resolution: number): { geometry: THREE.PlaneGeometry; spacing: number } {
  const geometry = new THREE.PlaneGeometry(2, 2, resolution, resolution);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  const warp = (u: number) => half * u * (FOLLOW_CENTRE_SHARE + (1 - FOLLOW_CENTRE_SHARE) * u * u);
  for (let i = 0; i < positions.count; i += 1) {
    positions.setX(i, warp(positions.getX(i)));
    positions.setZ(i, warp(positions.getZ(i)));
  }
  positions.needsUpdate = true;
  return { geometry, spacing: (half * FOLLOW_CENTRE_SHARE * 2) / resolution };
}

function createSheetGeometry(config: ResolvedOceanConfig): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(config.size, config.depth, config.resolution, config.resolution);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * Bake the ground under the sheet into a half-float height map, one row per slice.
 * @internal
 */
export function* bakeOceanBed(bedAt: (x: number, z: number) => number, bounds: OceanBedBounds, resolution: number): SlicedJob<THREE.DataTexture> {
  const [minX, minZ, maxX, maxZ] = bounds;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const data = new Uint16Array(resolution * resolution);
  for (let row = 0; row < resolution; row += 1) {
    const z = minZ + ((row + 0.5) / resolution) * depth;
    for (let column = 0; column < resolution; column += 1) {
      const height = bedAt(minX + ((column + 0.5) / resolution) * width, z);
      data[row * resolution + column] = THREE.DataUtils.toHalfFloat(Number.isFinite(height) ? Math.max(-60000, Math.min(60000, height)) : -1000);
    }
    yield;
  }
  const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RedFormat, THREE.HalfFloatType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * An animated Gerstner-wave water surface lit by the scene's sky: it reflects the sky's colours, takes
 * the sun's and moon's light, clears over shallows and foams at the shore wherever `bedAt` puts the bed,
 * and follows the camera to the horizon when `config.follow` is set.
 */
export function Ocean({ config, bedAt, bedBounds, ...meshProps }: OceanProps) {
  const resolved = useMemo(() => createOceanConfig(config), [config]);
  const far = useThree((state) => (state.camera instanceof THREE.PerspectiveCamera || state.camera instanceof THREE.OrthographicCamera ? state.camera.far : 0));
  const followHalf = resolved.follow ? Math.max(resolved.size, resolved.depth, (Number.isFinite(far) ? far : 0) * 2) / 2 : 0;
  const sheet = useMemo(
    () => (resolved.follow ? createFollowGeometry(followHalf, resolved.resolution) : { geometry: createSheetGeometry(resolved), spacing: 0 }),
    [resolved, followHalf],
  );
  useEffect(() => () => sheet.geometry.dispose(), [sheet]);
  const material = useDisposable(() => createOceanMaterial(resolved), [resolved]);

  const bounds = useMemo<OceanBedBounds>(
    () => bedBounds ?? [-resolved.size / 2, -resolved.depth / 2, resolved.size / 2, resolved.depth / 2],
    [bedBounds, resolved.size, resolved.depth],
  );
  const bedResolution = oceanBedResolution(resolved, Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]));
  const baked = useSlicedValue(
    "ocean bed",
    () => (bedAt === undefined ? (function* none(): SlicedJob<null> { return null; })() : bakeOceanBed(bedAt, bounds, bedResolution)),
    [bedAt, bounds, bedResolution],
  );
  useEffect(() => () => baked?.dispose(), [baked]);
  const bed = bedAt === undefined ? deepBedTexture() : baked;

  const elapsedRef = useRef(0);
  useEffect(() => {
    elapsedRef.current = 0;
  }, [material]);
  const meshRef = useRef<THREE.Mesh>(null);
  const world = useMemo(() => new THREE.Vector3(), []);

  const ctx = useOptionalGameContext();
  useFrame((state, delta) => {
    // Waves run on the game clock, so they stop when the game pauses and line up with the water
    // surface buoyancy samples; before any game time has passed (a title screen) or with no game
    // (an editor preview) they run on real time.
    const advanced = ctx?.time.advancedSeconds?.();
    elapsedRef.current = advanced !== undefined && advanced > 0 ? advanced * resolved.timeScale : elapsedRef.current + delta * resolved.timeScale;
    syncOceanMaterial(material, resolved, elapsedRef.current, readSkyLight(state.scene));
    const mesh = meshRef.current;
    if (mesh === null || bed === null) return;
    const u = material.uniforms;
    u.uBedMap.value = bed;
    u.uBedRect.value.set(bounds[0], bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1]);
    world.setFromMatrixPosition(mesh.matrixWorld);
    u.uOrigin.value.set(world.x, world.z);
    u.uSurfaceY.value = world.y;
    if (resolved.follow) {
      // Snap to the finest vertex spacing so the near grid does not slide under the waves.
      const step = sheet.spacing > 0 ? sheet.spacing : 1;
      u.uFollow.value.set(Math.round((state.camera.position.x - world.x) / step) * step, Math.round((state.camera.position.z - world.z) / step) * step);
    } else {
      u.uFollow.value.set(0, 0);
    }
  });

  if (bed === null) return null;
  return <mesh {...meshProps} ref={meshRef} geometry={sheet.geometry} material={material} frustumCulled={resolved.follow ? false : meshProps.frustumCulled ?? true} />;
}

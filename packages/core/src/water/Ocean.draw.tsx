// @skill jgengine-world
import { useRef } from "react";
import * as THREE from "three";
import { useOptionalGameContext } from "@jgengine/react/provider";

import type { SlicedJob } from "@jgengine/core/run/slicedWork";
import { runSliced } from "@jgengine/core/run/slicedWork";
import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { readSkyLight } from "@jgengine/core/sky/skyLight.draw";
import { createOceanConfig, oceanBedResolution, type OceanConfig, type ResolvedOceanConfig } from "./OceanConfig.draw";
import { createOceanMaterial, deepBedTexture, syncOceanMaterial, type OceanShaderMaterial } from "./OceanMaterial.draw";
import type { OceanBedBounds } from "./oceanBed";

/** Props for {@link Ocean}: the ocean config, the ground under it, and mesh props. */
export interface OceanProps extends Omit<OceanDrawProps, "ctx"> {
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

/** The slice of an {@link OceanProps} the draw reads; `ctx` carries game time like the old provider. */
export interface OceanDrawProps {
  config?: OceanConfig | undefined;
  bedAt?: ((x: number, z: number) => number) | undefined;
  bedBounds?: OceanBedBounds | undefined;
  position?: readonly [number, number, number] | THREE.Vector3 | undefined;
  frustumCulled?: boolean | undefined;
  ctx?: GameContext | null | undefined;
}

/**
 * An animated Gerstner-wave water surface lit by the scene's sky: it reflects the sky's colours, takes
 * the sun's and moon's light, clears over shallows and foams at the shore wherever `bedAt` puts the bed,
 * and follows the camera to the horizon when `config.follow` is set.
 */
export function oceanDraw(getProps: () => OceanDrawProps): EngineDraw {
  let mesh: THREE.Mesh | null = null;
  let geometry: THREE.PlaneGeometry | null = null;
  let material: OceanShaderMaterial | null = null;
  let resolved: ResolvedOceanConfig | null = null;
  let sheet: { geometry: THREE.PlaneGeometry; spacing: number } | null = null;
  let bed: THREE.DataTexture | null = null;
  let bedOwned = false;
  let bounds: OceanBedBounds = [0, 0, 0, 0];
  let elapsed = 0;
  let added = false;
  let cancelled = false;
  let bedRun: { cancel(): void } | null = null;
  const world = new THREE.Vector3();

  function applyPosition(props: OceanDrawProps): void {
    const position = props.position;
    if (mesh === null || position === undefined) return;
    if (position instanceof THREE.Vector3) mesh.position.copy(position);
    else mesh.position.set(position[0], position[1], position[2]);
  }

  return {
    mount(state: EngineFrameState) {
      const props = getProps();
      resolved = createOceanConfig(props.config);
      const far = state.camera instanceof THREE.PerspectiveCamera || state.camera instanceof THREE.OrthographicCamera ? state.camera.far : 0;
      const followHalf = resolved.follow ? Math.max(resolved.size, resolved.depth, (Number.isFinite(far) ? far : 0) * 2) / 2 : 0;
      sheet = resolved.follow
        ? createFollowGeometry(followHalf, resolved.resolution)
        : { geometry: createSheetGeometry(resolved), spacing: 0 };
      geometry = sheet.geometry;
      material = createOceanMaterial(resolved);
      bounds = props.bedBounds ?? [-resolved.size / 2, -resolved.depth / 2, resolved.size / 2, resolved.depth / 2];
      const bedResolution = oceanBedResolution(resolved, Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]));
      if (props.bedAt === undefined) {
        bed = deepBedTexture();
      } else {
        const done = trackSceneWork("ocean bed");
        const bedAt = props.bedAt;
        const run = runSliced(bakeOceanBed(bedAt, bounds, bedResolution));
        bedRun = run;
        run.done.then(
          (texture) => {
            done();
            if (cancelled) {
              texture.dispose();
              return;
            }
            bed = texture;
            bedOwned = true;
            state.invalidate();
          },
          (error: unknown) => {
            done();
            console.error("[jgengine] ocean bed failed to build", error);
          },
        );
      }
      mesh = new THREE.Mesh(geometry, material);
      applyPosition(props);
      mesh.frustumCulled = resolved.follow ? false : props.frustumCulled ?? true;
      if (bed !== null) {
        state.scene.add(mesh);
        added = true;
      }
      elapsed = 0;
    },
    frame(state: EngineFrameState) {
      const props = getProps();
      const config = resolved;
      const mat = material;
      const sheetGeometry = sheet;
      if (config === null || mat === null || mesh === null) return;
      applyPosition(props);
      if (!config.follow) mesh.frustumCulled = props.frustumCulled ?? true;
      if (bed !== null && !added) {
        state.scene.add(mesh);
        added = true;
      }
      // Waves run on the game clock, so they stop when the game pauses and line up with the water
      // surface buoyancy samples; before any game time has passed (a title screen) or with no game
      // (an editor preview) they run on real time.
      const advanced = props.ctx?.time.advancedSeconds?.();
      elapsed = advanced !== undefined && advanced > 0 ? advanced * config.timeScale : elapsed + state.delta * config.timeScale;
      syncOceanMaterial(mat, config, elapsed, readSkyLight(state.scene));
      const surface = bed;
      if (surface === null) return;
      const u = mat.uniforms;
      u.uBedMap.value = surface;
      u.uBedRect.value.set(bounds[0], bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1]);
      world.setFromMatrixPosition(mesh.matrixWorld);
      u.uOrigin.value.set(world.x, world.z);
      u.uSurfaceY.value = world.y;
      if (config.follow && sheetGeometry !== null) {
        // Snap to the finest vertex spacing so the near grid does not slide under the waves.
        const step = sheetGeometry.spacing > 0 ? sheetGeometry.spacing : 1;
        u.uFollow.value.set(Math.round((state.camera.position.x - world.x) / step) * step, Math.round((state.camera.position.z - world.z) / step) * step);
      } else {
        u.uFollow.value.set(0, 0);
      }
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      bedRun?.cancel();
      bedRun = null;
      if (added && mesh !== null) state.scene.remove(mesh);
      added = false;
      if (bedOwned) bed?.dispose();
      bed = null;
      bedOwned = false;
      geometry?.dispose();
      material?.dispose();
      geometry = null;
      material = null;
      sheet = null;
      mesh = null;
      resolved = null;
    },
  };
}

/**
 * An animated Gerstner-wave water surface lit by the scene's sky: it reflects the sky's colours, takes
 * the sun's and moon's light, clears over shallows and foams at the shore wherever `bedAt` puts the bed,
 * and follows the camera to the horizon when `config.follow` is set.
 */
export function Ocean(props: OceanProps) {
  const ctx = useOptionalGameContext();
  const latest = useRef<OceanDrawProps>({});
  latest.current = {
    config: props.config,
    bedAt: props.bedAt,
    bedBounds: props.bedBounds,
    position: props.position,
    frustumCulled: props.frustumCulled,
    ctx,
  };
  useEngineDraw(() => oceanDraw(() => latest.current), [props.config, props.bedAt, props.bedBounds, ctx]);
  return null;
}

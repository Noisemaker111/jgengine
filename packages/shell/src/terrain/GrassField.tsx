import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { devtools } from "@jgengine/core/devtools/devtools";
import type { GrassRules } from "@jgengine/core/world/grassKind";
import { GRASS_BLADE_BUDGET } from "@jgengine/core/world/scatterCoverage";

import { useDisposable } from "../render/useDisposable";
import { GrassCover } from "./GrassCover";
import {
  createGrassGeometryChunks,
  GRASS_TUFT_BLADES,
  type GrassExclusion,
} from "./grassGeometry";
import { createGrassMaterial, type GrassDistanceFadeOptions } from "./grassMaterial";
import type { TerrainSeed } from "./random";
import { resolveTerrainSize, type TerrainArea, type TerrainHeightSampler } from "./terrainMath";

export { GRASS_TUFT_BLADES } from "./grassGeometry";

/**
 * Inside this distance every chunk draws all its tufts; beyond it a chunk draws a shrinking random
 * subset (the tuft order is already shuffled), and the shader widens the survivors to keep coverage.
 */
const GRASS_LOD_NEAR = 18;
/** Smallest share of a chunk's tufts the distance LOD keeps before the fade band takes over. */
const GRASS_LOD_MIN = 0.05;

/** Blades a patch places: its density over its footprint, capped at `budget`, with a devtools note when capped. @internal */
export function grassBladeCount(density: number, area: TerrainArea, budget: number = GRASS_BLADE_BUDGET): number {
  const size = resolveTerrainSize(area);
  const requested = Math.max(0, density) * Math.max(0, size.width) * Math.max(0, size.depth);
  const cap = Math.max(0, Math.floor(budget));
  if (requested > cap) {
    devtools.logs.push("warn", `[jgengine:grass] ${Math.floor(requested)} blades over ${size.width.toFixed(0)}×${size.depth.toFixed(0)} m exceeds the ${cap} blade budget — split the patch`);
  }
  return Math.floor(Math.min(cap, requested));
}

/** Share of a chunk's tufts drawn at `distance` metres from the camera. @internal */
export function grassLodShare(distance: number): number {
  if (distance <= GRASS_LOD_NEAR) return 1;
  const ratio = GRASS_LOD_NEAR / distance;
  return Math.max(GRASS_LOD_MIN, ratio * ratio);
}

function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}

export interface GrassFieldProps extends Omit<ThreeElements["group"], "children"> {
  /** The patch's grass knobs (`readGrassRules` from a `grass_field` volume, or a `grass()` descriptor's `rules`). */
  rules: GrassRules;
  /** Footprint size in metres, centred on the group origin. */
  area: TerrainArea;
  /** Seed used when `rules.seed` is empty (an editor volume passes its id). */
  seed?: TerrainSeed;
  /** Blade ceiling for this patch. Default the shared grass budget. */
  budget?: number;
  segments?: number;
  tuftBlades?: number;
  /** Metres of soft fringe at the patch border. Default scales with the patch, 1.5–4 m. */
  edgeFeather?: number;
  exclude?: readonly GrassExclusion[];
  heightAt?: TerrainHeightSampler;
  coverageAt?: TerrainHeightSampler;
  /** Ground colour blade roots blend into. */
  colorGround?: THREE.ColorRepresentation;
  distanceFade?: GrassDistanceFadeOptions | false;
  castShadow?: boolean;
  receiveShadow?: boolean;
  frustumCulled?: boolean;
}

/**
 * The engine's one grass renderer: seeded blade tufts with vertex wind over a turf mat, drawn in
 * bounded chunks with per-camera frustum and distance LOD. Every grass source resolves to
 * {@link GrassRules} and mounts this, so density, species, colour, height, wind and clumping read
 * the same everywhere.
 */
export function GrassField({
  rules,
  area,
  seed,
  budget,
  segments = 4,
  tuftBlades = GRASS_TUFT_BLADES,
  edgeFeather,
  exclude,
  heightAt,
  coverageAt,
  colorGround,
  distanceFade,
  castShadow = false,
  receiveShadow = true,
  frustumCulled = true,
  ...groupProps
}: GrassFieldProps) {
  const resolvedSeed: TerrainSeed = rules.seed.length > 0 ? rules.seed : (seed ?? "grass");
  const size = resolveTerrainSize(area);
  const feather = edgeFeather ?? Math.min(4, Math.max(1.5, Math.min(size.width, size.depth) * 0.12));
  const bladeCount = useMemo(() => grassBladeCount(rules.density, area, budget), [rules.density, area, budget]);
  const height = useMemo(() => [rules.bladeHeight * (1 - rules.heightVariation), rules.bladeHeight] as const, [rules.bladeHeight, rules.heightVariation]);
  const width = useMemo(() => [rules.bladeWidthMin, rules.bladeWidthMax] as const, [rules.bladeWidthMin, rules.bladeWidthMax]);
  const bend = useMemo(() => [rules.bladeBendMin, rules.bladeBendMax] as const, [rules.bladeBendMin, rules.bladeBendMax]);
  const chunks = useMemo(
    () =>
      createGrassGeometryChunks({
        count: bladeCount,
        area,
        seed: resolvedSeed,
        segments,
        height,
        width,
        bend,
        tuftBlades,
        tuftRadius: rules.tuftRadius,
        edgeFeather: feather,
        ...(exclude === undefined ? {} : { exclude }),
        heightAt,
        coverageAt,
        clumping: rules.clumping,
        clumpSize: rules.clumpSize,
        accentShare: rules.accentShare,
        accentHeight: rules.accentHeight,
      }),
    [area, bend, bladeCount, coverageAt, exclude, feather, height, heightAt, resolvedSeed, rules.accentHeight, rules.accentShare,
      rules.clumpSize, rules.clumping, rules.tuftRadius, segments, tuftBlades, width],
  );
  useDisposable(() => chunks.map((chunk) => chunk.geometry), [chunks]);
  // Captured once per geometry set: the per-camera hooks below rewrite `instanceCount` every draw.
  const tufts = useMemo(() => chunks.map((chunk) => chunk.geometry.instanceCount), [chunks]);
  const handle = useMemo(
    () =>
      createGrassMaterial({
        colorBase: rules.colorBase,
        colorTip: rules.colorTip,
        accentColor: rules.accentColor,
        colorGround,
        colorVariation: rules.colorVariation,
        wind: { strength: rules.windStrength, speed: rules.windSpeed, gustScale: rules.windGust },
        distanceFade,
        normalLift: rules.normalLift,
        roughness: rules.roughness,
      }),
    [colorGround, distanceFade, rules.accentColor, rules.colorBase, rules.colorTip, rules.colorVariation, rules.normalLift,
      rules.roughness, rules.windGust, rules.windSpeed, rules.windStrength],
  );

  const draws = useMemo(() => {
    const patchBounds = new THREE.Box3(new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(0.5, 1, 0));
    const windExtent = (Math.abs(handle.uniforms.uWindStrength.value) + Math.abs(handle.uniforms.uWindFlutter.value)) * 1.2;
    for (const chunk of chunks) {
      chunk.bounds.copy(chunk.roots).expandByScalar(chunk.bladeExtent + windExtent);
      chunk.geometry.boundingBox = chunk.bounds;
      patchBounds.union(chunk.bounds);
    }
    const sphere = patchBounds.getBoundingSphere(new THREE.Sphere());
    // All chunks retain the patch's shadow bounds; the factor also covers affine parent shear.
    sphere.radius *= Math.sqrt(3);
    const worldBounds = new THREE.Box3();
    const cameraPosition = new THREE.Vector3();
    const projection = new THREE.Matrix4();
    const frustum = new THREE.Frustum();
    return chunks.map((chunk, index) => {
      const full = tufts[index]!;
      chunk.geometry.boundingSphere = sphere;
      const beforeRender: THREE.Mesh["onBeforeRender"] = function (this: THREE.Mesh, _renderer, _scene, camera) {
        let visible = true;
        if (frustumCulled) {
          projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
          frustum.setFromProjectionMatrix(projection, camera.coordinateSystem, camera.reversedDepth);
          visible = frustum.intersectsBox(worldBounds.copy(chunk.bounds).applyMatrix4(this.matrixWorld));
        }
        let share = 1;
        const fade = handle.uniforms.uDistanceFade.value;
        if (visible && fade.y > fade.x) {
          camera.getWorldPosition(cameraPosition);
          const distance = worldBounds.copy(chunk.roots).applyMatrix4(this.matrixWorld).distanceToPoint(cameraPosition);
          visible = distance <= fade.y;
          share = grassLodShare(distance);
        }
        chunk.geometry.instanceCount = visible ? Math.ceil(full * share) : 0;
      };
      const beforeShadow: THREE.Mesh["onBeforeShadow"] = function () {
        chunk.geometry.instanceCount = full;
      };
      return { geometry: chunk.geometry, beforeRender, beforeShadow };
    });
  }, [chunks, frustumCulled, handle, tufts]);

  useFrame((state) => {
    handle.uniforms.uTime.value = state.clock.elapsedTime;
  });

  useEffect(() => () => handle.material.dispose(), [handle]);

  const coverSeed = typeof resolvedSeed === "number" ? resolvedSeed : hashSeed(resolvedSeed);
  const coverArea = useMemo(() => [size.width, size.depth] as const, [size.width, size.depth]);
  return (
    <group {...groupProps}>
      {rules.groundCover > 0 ? (
        <GrassCover
          area={coverArea}
          seed={coverSeed}
          colorBase={rules.colorBase}
          colorTip={rules.colorTip}
          strength={rules.groundCover}
          edgeFeather={feather}
          heightAt={heightAt ?? zeroHeight}
          coverageAt={coverageAt ?? fullCoverage}
        />
      ) : null}
      {draws.map((draw, index) => (
        <mesh key={index} geometry={draw.geometry} material={handle.material}
          castShadow={castShadow} receiveShadow={receiveShadow} frustumCulled={frustumCulled}
          onBeforeRender={draw.beforeRender} onBeforeShadow={draw.beforeShadow} dispose={null} />
      ))}
    </group>
  );
}

const zeroHeight: TerrainHeightSampler = () => 0;
const fullCoverage: TerrainHeightSampler = () => 1;

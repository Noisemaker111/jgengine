import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo } from "react";

import {
  createGrassBladeGeometry,
  grassTuftCount,
  GRASS_TUFT_BLADES,
  type GrassBladeGeometryOptions,
  type GrassExclusion,
  type GrassRange,
} from "./grassGeometry";
import {
  createGrassMaterial,
  type GrassDistanceFadeOptions,
  type GrassMaterialOptions,
  type GrassWindOptions,
} from "./grassMaterial";
import type { TerrainArea, TerrainHeightSampler } from "./terrainMath";
import {
  DEFAULT_GRASS_COUNT,
  DEFAULT_GRASS_DENSITY,
  resolveGrassInstanceBudget,
} from "./grassBudget";

export { DEFAULT_GRASS_COUNT, DEFAULT_GRASS_DENSITY, resolveGrassInstanceBudget } from "./grassBudget";
export { GRASS_TUFT_BLADES } from "./grassGeometry";

export interface GrassFieldProps extends Omit<ThreeElements["mesh"], "args" | "children" | "geometry" | "material"> {
  count?: number;
  density?: number;
  budget?: number;
  area?: TerrainArea;
  seed?: GrassBladeGeometryOptions["seed"];
  segments?: number;
  bladeHeight?: GrassRange;
  bladeWidth?: GrassRange;
  bladeBend?: GrassRange;
  tuftBlades?: number;
  tuftRadius?: number;
  edgeFeather?: number;
  exclude?: readonly GrassExclusion[];
  heightAt?: TerrainHeightSampler;
  colorBase?: GrassMaterialOptions["colorBase"];
  colorTip?: GrassMaterialOptions["colorTip"];
  colorGround?: GrassMaterialOptions["colorGround"];
  colorVariation?: number;
  wind?: GrassWindOptions | false;
  distanceFade?: GrassDistanceFadeOptions | false;
  normalLift?: number;
  roughness?: number;
}

export function GrassField({
  count = DEFAULT_GRASS_COUNT,
  density = DEFAULT_GRASS_DENSITY,
  budget,
  area = 40,
  seed = 1,
  segments = 4,
  bladeHeight,
  bladeWidth,
  bladeBend,
  tuftBlades = GRASS_TUFT_BLADES,
  tuftRadius,
  edgeFeather,
  exclude,
  heightAt,
  colorBase,
  colorTip,
  colorGround,
  colorVariation,
  wind,
  distanceFade,
  normalLift,
  roughness,
  castShadow = false,
  receiveShadow = true,
  frustumCulled = true,
  ...meshProps
}: GrassFieldProps) {
  const geometry = useMemo(
    () =>
      createGrassBladeGeometry({
        count,
        area,
        seed,
        segments,
        height: bladeHeight,
        width: bladeWidth,
        bend: bladeBend,
        ...(tuftBlades === undefined ? {} : { tuftBlades }),
        ...(tuftRadius === undefined ? {} : { tuftRadius }),
        ...(edgeFeather === undefined ? {} : { edgeFeather }),
        ...(exclude === undefined ? {} : { exclude }),
        heightAt,
      }),
    [area, bladeBend, bladeHeight, bladeWidth, count, edgeFeather, exclude, heightAt, seed, segments, tuftBlades, tuftRadius],
  );
  const handle = useMemo(
    () =>
      createGrassMaterial({
        colorBase,
        colorTip,
        colorGround,
        colorVariation,
        wind,
        distanceFade,
        normalLift,
        roughness,
      }),
    [colorBase, colorTip, colorGround, colorVariation, distanceFade, normalLift, roughness, wind],
  );

  // Budgets stay in blades (the public unit); the instance buffer carries tufts.
  const instanceCount = useMemo(
    () => grassTuftCount(resolveGrassInstanceBudget(count, density, area, budget), tuftBlades),
    [count, density, area, budget, tuftBlades],
  );
  geometry.instanceCount = Math.min(instanceCount, grassTuftCount(count, tuftBlades));

  useFrame((state) => {
    handle.uniforms.uTime.value = state.clock.elapsedTime;
  });

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => handle.material.dispose(), [handle]);

  return (
    <mesh
      {...meshProps}
      geometry={geometry}
      material={handle.material}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={frustumCulled}
    />
  );
}

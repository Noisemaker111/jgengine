import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo } from "react";

import { createGrassBladeGeometry, type GrassBladeGeometryOptions, type GrassRange } from "./grassGeometry";
import { createGrassMaterial, type GrassMaterialOptions, type GrassWindOptions } from "./grassMaterial";
import type { TerrainArea, TerrainHeightSampler } from "./terrainMath";
import {
  DEFAULT_GRASS_COUNT,
  DEFAULT_GRASS_DENSITY,
  resolveGrassInstanceBudget,
} from "./grassBudget";

export { DEFAULT_GRASS_COUNT, DEFAULT_GRASS_DENSITY, resolveGrassInstanceBudget } from "./grassBudget";

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
  heightAt?: TerrainHeightSampler;
  colorBase?: GrassMaterialOptions["colorBase"];
  colorTip?: GrassMaterialOptions["colorTip"];
  colorVariation?: number;
  wind?: GrassWindOptions | false;
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
  heightAt,
  colorBase,
  colorTip,
  colorVariation,
  wind,
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
        heightAt,
      }),
    [area, bladeBend, bladeHeight, bladeWidth, count, heightAt, seed, segments],
  );
  const handle = useMemo(
    () =>
      createGrassMaterial({
        colorBase,
        colorTip,
        colorVariation,
        wind,
        roughness,
      }),
    [colorBase, colorTip, colorVariation, roughness, wind],
  );

  geometry.instanceCount = resolveGrassInstanceBudget(count, density, area, budget);

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

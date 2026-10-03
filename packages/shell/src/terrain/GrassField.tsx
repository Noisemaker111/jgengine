import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { useDisposable } from "../render/useDisposable";
import {
  createGrassGeometryChunks,
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

/** Seeded grass tufts with bounded per-camera chunk submission; density and budgets stay in blades. */
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
  onBeforeRender,
  onBeforeShadow,
  onAfterRender,
  onAfterShadow,
  ...meshProps
}: GrassFieldProps) {
  const chunks = useMemo(
    () =>
      createGrassGeometryChunks({
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
  useDisposable(() => chunks.map((chunk) => chunk.geometry), [chunks]);
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
  const draws = useMemo(() => {
    const counts = chunks.map((chunk) => {
      let low = 0, high = chunk.indices.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (chunk.indices[mid]! < instanceCount) low = mid + 1;
        else high = mid;
      }
      return low;
    });
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
      chunk.geometry.boundingSphere = sphere;
      chunk.geometry.instanceCount = counts[index]!;
      const beforeRender: THREE.Mesh["onBeforeRender"] = function (this: THREE.Mesh, renderer, scene, camera, geometry, material, group) {
        let visible = true;
        if (frustumCulled) {
          projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
          frustum.setFromProjectionMatrix(projection, camera.coordinateSystem, camera.reversedDepth);
          visible = frustum.intersectsBox(worldBounds.copy(chunk.bounds).applyMatrix4(this.matrixWorld));
        }
        const fade = handle.uniforms.uDistanceFade.value;
        if (visible && fade.y > fade.x) {
          camera.getWorldPosition(cameraPosition);
          visible = worldBounds.copy(chunk.roots).applyMatrix4(this.matrixWorld).distanceToPoint(cameraPosition) <= fade.y;
        }
        chunk.geometry.instanceCount = visible ? counts[index]! : 0;
        (onBeforeRender as THREE.Mesh["onBeforeRender"] | undefined)?.call(this, renderer, scene, camera, geometry, material, group);
      };
      const beforeShadow: THREE.Mesh["onBeforeShadow"] = function (this: THREE.Mesh, ...args) {
        chunk.geometry.instanceCount = counts[index]!;
        (onBeforeShadow as THREE.Mesh["onBeforeShadow"] | undefined)?.apply(this, args);
      };
      return { geometry: chunk.geometry, beforeRender, beforeShadow };
    });
  }, [chunks, frustumCulled, handle, instanceCount, onBeforeRender, onBeforeShadow]);

  useFrame((state) => {
    handle.uniforms.uTime.value = state.clock.elapsedTime;
  });

  useEffect(() => () => handle.material.dispose(), [handle]);

  const root = draws[0]!;
  return (
    <mesh
      {...meshProps}
      geometry={root.geometry}
      material={handle.material}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={frustumCulled}
      onBeforeRender={root.beforeRender}
      onBeforeShadow={root.beforeShadow}
      onAfterRender={onAfterRender}
      onAfterShadow={onAfterShadow}
      dispose={null}
    >
      {draws.slice(1).map((draw, index) => (
        <mesh key={index} geometry={draw.geometry} material={handle.material}
          castShadow={castShadow} receiveShadow={receiveShadow} frustumCulled={frustumCulled}
          onBeforeRender={draw.beforeRender} onBeforeShadow={draw.beforeShadow}
          onAfterRender={onAfterRender} onAfterShadow={onAfterShadow} dispose={null} />
      ))}
    </mesh>
  );
}

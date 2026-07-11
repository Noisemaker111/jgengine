import * as THREE from "three";

import { createSeededRandom, type TerrainSeed } from "./random";
import { resolveTerrainSize, type TerrainArea, type TerrainHeightSampler } from "./terrainMath";

export type GrassRange = number | readonly [min: number, max: number];

export interface GrassBladeGeometryOptions {
  count?: number;
  area?: TerrainArea;
  seed?: TerrainSeed;
  segments?: number;
  height?: GrassRange;
  width?: GrassRange;
  bend?: GrassRange;
  heightAt?: TerrainHeightSampler;
}

export interface ResolvedGrassBladeGeometryOptions {
  count: number;
  area: TerrainArea;
  seed: TerrainSeed;
  segments: number;
  height: readonly [min: number, max: number];
  width: readonly [min: number, max: number];
  bend: readonly [min: number, max: number];
  heightAt: TerrainHeightSampler;
}

export function resolveGrassRange(value: GrassRange | undefined, fallback: readonly [number, number]): readonly [number, number] {
  if (value === undefined) return fallback;
  return typeof value === "number" ? [value, value] : value;
}

export function resolveGrassBladeGeometryOptions(
  options: GrassBladeGeometryOptions = {},
): ResolvedGrassBladeGeometryOptions {
  return {
    count: Math.max(0, Math.floor(options.count ?? 1500)),
    area: options.area ?? 40,
    seed: options.seed ?? 1,
    segments: Math.max(1, Math.floor(options.segments ?? 4)),
    height: resolveGrassRange(options.height, [0.55, 1.1]),
    width: resolveGrassRange(options.width, [0.035, 0.075]),
    bend: resolveGrassRange(options.bend, [0.08, 0.32]),
    heightAt: options.heightAt ?? (() => 0),
  };
}

function randomRange(random: () => number, range: readonly [number, number]): number {
  return THREE.MathUtils.lerp(range[0], range[1], random());
}

export function createGrassBladeGeometry(options: GrassBladeGeometryOptions = {}): THREE.InstancedBufferGeometry {
  const resolved = resolveGrassBladeGeometryOptions(options);
  const size = resolveTerrainSize(resolved.area);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let segment = 0; segment <= resolved.segments; segment += 1) {
    const t = segment / resolved.segments;
    positions.push(-0.5, t, 0, 0.5, t, 0);
    normals.push(0, 0, 1, 0, 0, 1);
    uvs.push(0, t, 1, t);
    if (segment < resolved.segments) {
      const base = segment * 2;
      indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
    }
  }

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  const random = createSeededRandom(resolved.seed);
  const offsets = new Float32Array(resolved.count * 3);
  const yaw = new Float32Array(resolved.count);
  const heights = new Float32Array(resolved.count);
  const widths = new Float32Array(resolved.count);
  const bend = new Float32Array(resolved.count);
  const phase = new Float32Array(resolved.count);
  const colorMix = new Float32Array(resolved.count);

  for (let index = 0; index < resolved.count; index += 1) {
    const x = (random() - 0.5) * size.width;
    const z = (random() - 0.5) * size.depth;
    offsets[index * 3] = x;
    offsets[index * 3 + 1] = resolved.heightAt(x, z);
    offsets[index * 3 + 2] = z;
    yaw[index] = random() * Math.PI * 2;
    heights[index] = randomRange(random, resolved.height);
    widths[index] = randomRange(random, resolved.width);
    bend[index] = randomRange(random, resolved.bend);
    phase[index] = random() * Math.PI * 2;
    colorMix[index] = random();
  }

  geometry.setAttribute("instanceOffset", new THREE.InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute("instanceYaw", new THREE.InstancedBufferAttribute(yaw, 1));
  geometry.setAttribute("instanceHeight", new THREE.InstancedBufferAttribute(heights, 1));
  geometry.setAttribute("instanceWidth", new THREE.InstancedBufferAttribute(widths, 1));
  geometry.setAttribute("instanceBend", new THREE.InstancedBufferAttribute(bend, 1));
  geometry.setAttribute("instancePhase", new THREE.InstancedBufferAttribute(phase, 1));
  geometry.setAttribute("instanceColorMix", new THREE.InstancedBufferAttribute(colorMix, 1));
  geometry.instanceCount = resolved.count;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.max(size.width, size.depth) * 0.75 + resolved.height[1]);
  return geometry;
}

import * as THREE from "three";

import { hashNoise2, type TerrainSeed } from "./random";

export type TerrainArea = number | readonly [width: number, depth: number];
export type TerrainHeightSampler = (x: number, z: number) => number;

export interface ProceduralTerrainConfig {
  size?: TerrainArea;
  segments?: number | readonly [x: number, z: number];
  seed?: TerrainSeed;
  height?: number;
  moundScale?: number;
  detailScale?: number;
  detail?: number;
  baseOffset?: number;
}

export interface ResolvedTerrainSize {
  width: number;
  depth: number;
}

export interface ResolvedTerrainSegments {
  x: number;
  z: number;
}

export interface TerrainVertexColorOptions {
  low?: THREE.ColorRepresentation;
  high?: THREE.ColorRepresentation;
  waterline?: THREE.ColorRepresentation;
  waterlineHeight?: number;
}

export function resolveTerrainSize(size: TerrainArea = 40): ResolvedTerrainSize {
  return typeof size === "number" ? { width: size, depth: size } : { width: size[0], depth: size[1] };
}

export function resolveTerrainSegments(segments: ProceduralTerrainConfig["segments"] = 96): ResolvedTerrainSegments {
  if (typeof segments !== "number") return { x: Math.max(1, Math.floor(segments[0])), z: Math.max(1, Math.floor(segments[1])) };
  const resolved = Math.max(1, Math.floor(segments));
  return { x: resolved, z: resolved };
}

export function smoothValueNoise2(x: number, z: number, seed: TerrainSeed = 1): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const xf = x - x0;
  const zf = z - z0;
  const sx = xf * xf * (3 - 2 * xf);
  const sz = zf * zf * (3 - 2 * zf);
  const a = hashNoise2(x0, z0, seed);
  const b = hashNoise2(x0 + 1, z0, seed);
  const c = hashNoise2(x0, z0 + 1, seed);
  const d = hashNoise2(x0 + 1, z0 + 1, seed);
  const top = THREE.MathUtils.lerp(a, b, sx);
  const bottom = THREE.MathUtils.lerp(c, d, sx);
  return THREE.MathUtils.lerp(top, bottom, sz);
}

export function fbmValueNoise2(x: number, z: number, seed: TerrainSeed = 1, octaves = 4): number {
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  let normalizer = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += smoothValueNoise2(x * frequency, z * frequency, `${seed}:${octave}`) * amplitude;
    normalizer += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return normalizer === 0 ? 0 : total / normalizer;
}

export function createProceduralTerrainSampler(config: ProceduralTerrainConfig = {}): TerrainHeightSampler {
  const seed = config.seed ?? 1;
  const height = config.height ?? 1.4;
  const moundScale = config.moundScale ?? 0.075;
  const detailScale = config.detailScale ?? 0.42;
  const detail = config.detail ?? 0.18;
  const baseOffset = config.baseOffset ?? 0;
  return (x, z) => {
    const mounds = fbmValueNoise2(x * moundScale, z * moundScale, seed, 4) * 2 - 1;
    const relief = fbmValueNoise2(x * detailScale + 19.7, z * detailScale - 11.3, `${seed}:detail`, 3) * 2 - 1;
    return baseOffset + mounds * height + relief * height * detail;
  };
}

export function createProceduralGroundGeometry(
  config: ProceduralTerrainConfig = {},
  colors: TerrainVertexColorOptions = {},
): THREE.BufferGeometry {
  const size = resolveTerrainSize(config.size);
  const segments = resolveTerrainSegments(config.segments);
  const sampler = createProceduralTerrainSampler(config);
  const vertexCountX = segments.x + 1;
  const vertexCountZ = segments.z + 1;
  const positions = new Float32Array(vertexCountX * vertexCountZ * 3);
  const uvs = new Float32Array(vertexCountX * vertexCountZ * 2);
  const colorValues = new Float32Array(vertexCountX * vertexCountZ * 3);
  const indices = new Uint32Array(segments.x * segments.z * 6);
  const low = new THREE.Color(colors.low ?? "#30402c");
  const high = new THREE.Color(colors.high ?? "#7f8b50");
  const waterline = colors.waterline === undefined ? null : new THREE.Color(colors.waterline);
  const minHeight = (config.baseOffset ?? 0) - (config.height ?? 1.4) * 1.2;
  const maxHeight = (config.baseOffset ?? 0) + (config.height ?? 1.4) * 1.2;
  let index = 0;
  let uvIndex = 0;
  let colorIndex = 0;

  for (let zIndex = 0; zIndex < vertexCountZ; zIndex += 1) {
    const v = zIndex / segments.z;
    const z = (v - 0.5) * size.depth;
    for (let xIndex = 0; xIndex < vertexCountX; xIndex += 1) {
      const u = xIndex / segments.x;
      const x = (u - 0.5) * size.width;
      const y = sampler(x, z);
      positions[index] = x;
      positions[index + 1] = y;
      positions[index + 2] = z;
      uvs[uvIndex] = u;
      uvs[uvIndex + 1] = v;
      const blend = THREE.MathUtils.clamp((y - minHeight) / (maxHeight - minHeight), 0, 1);
      const color = low.clone().lerp(high, blend);
      if (waterline !== null && y <= (colors.waterlineHeight ?? 0)) color.lerp(waterline, 0.65);
      colorValues[colorIndex] = color.r;
      colorValues[colorIndex + 1] = color.g;
      colorValues[colorIndex + 2] = color.b;
      index += 3;
      uvIndex += 2;
      colorIndex += 3;
    }
  }

  let triangleIndex = 0;
  for (let zIndex = 0; zIndex < segments.z; zIndex += 1) {
    for (let xIndex = 0; xIndex < segments.x; xIndex += 1) {
      const a = zIndex * vertexCountX + xIndex;
      const b = a + 1;
      const c = a + vertexCountX;
      const d = c + 1;
      indices[triangleIndex] = a;
      indices[triangleIndex + 1] = c;
      indices[triangleIndex + 2] = b;
      indices[triangleIndex + 3] = b;
      indices[triangleIndex + 4] = c;
      indices[triangleIndex + 5] = d;
      triangleIndex += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colorValues, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

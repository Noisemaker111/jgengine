import * as THREE from "three";

import { createSeededRandom, type TerrainSeed } from "./random";
import { resolveTerrainSize, type TerrainArea, type TerrainHeightSampler } from "./terrainMath";

export type GrassRange = number | readonly [min: number, max: number];

/** Blades baked into each tuft instance — one instance reads as a clump, not a lone blade. */
export const GRASS_TUFT_BLADES = 5;

/** A rectangle (patch-local XZ) the grass bake keeps clear — soil patches, water, plazas. */
export interface GrassExclusion {
  /** Rect center in patch-local coordinates. */
  center: readonly [x: number, z: number];
  /** Rect half extents. */
  half: readonly [x: number, z: number];
  /** Ramp width (m) outside the rect over which blades regrow to full height. Default 1.5. */
  feather?: number;
}

export interface GrassBladeGeometryOptions {
  /** Total blade budget for the patch (instances are tufts of `tuftBlades` blades each). */
  count?: number;
  area?: TerrainArea;
  seed?: TerrainSeed;
  segments?: number;
  height?: GrassRange;
  width?: GrassRange;
  bend?: GrassRange;
  /** Blades merged into each instanced tuft. Default {@link GRASS_TUFT_BLADES}. */
  tuftBlades?: number;
  /** Tuft spread radius in meters — how far clump blades splay from the tuft root. Default 0.16. */
  tuftRadius?: number;
  /** Meters of density/height feathering at the patch border so the field ends in a soft fringe, not a mowed rectangle. Default 1.5; 0 disables. */
  edgeFeather?: number;
  /** Patch-local rectangles kept clear of blades (soil patches, water) with a soft regrow ramp. */
  exclude?: readonly GrassExclusion[];
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
  tuftBlades: number;
  tuftRadius: number;
  edgeFeather: number;
  exclude: readonly GrassExclusion[];
  heightAt: TerrainHeightSampler;
}

/** @internal */
export function resolveGrassRange(value: GrassRange | undefined, fallback: readonly [number, number]): readonly [number, number] {
  if (value === undefined) return fallback;
  return typeof value === "number" ? [value, value] : value;
}

/** @internal */
export function resolveGrassBladeGeometryOptions(
  options: GrassBladeGeometryOptions = {},
): ResolvedGrassBladeGeometryOptions {
  return {
    count: Math.max(0, Math.floor(options.count ?? 1500)),
    area: options.area ?? 40,
    seed: options.seed ?? 1,
    segments: Math.max(1, Math.floor(options.segments ?? 4)),
    height: resolveGrassRange(options.height, [0.55, 1.1]),
    width: resolveGrassRange(options.width, [0.05, 0.1]),
    bend: resolveGrassRange(options.bend, [0.12, 0.42]),
    tuftBlades: Math.max(1, Math.floor(options.tuftBlades ?? GRASS_TUFT_BLADES)),
    tuftRadius: Math.max(0, options.tuftRadius ?? 0.16),
    edgeFeather: Math.max(0, options.edgeFeather ?? 1.5),
    exclude: options.exclude ?? [],
    heightAt: options.heightAt ?? (() => 0),
  };
}

/** Tuft instances needed to carry `bladeCount` blades at `tuftBlades` blades per tuft. @internal */
export function grassTuftCount(bladeCount: number, tuftBlades: number = GRASS_TUFT_BLADES): number {
  return Math.ceil(Math.max(0, bladeCount) / Math.max(1, tuftBlades));
}

function randomRange(random: () => number, range: readonly [number, number]): number {
  return THREE.MathUtils.lerp(range[0], range[1], random());
}

/**
 * Instanced tuft geometry: the template mesh is a clump of `tuftBlades` blades splayed around the
 * tuft root (per-blade yaw/offset/scale baked as vertex attributes), and each instance places one
 * whole clump. Clumps read as turf at a fraction of the instance count single blades need, and the
 * per-instance yaw/scale jitter hides the shared clump layout.
 * @internal
 */
export function createGrassBladeGeometry(options: GrassBladeGeometryOptions = {}): THREE.InstancedBufferGeometry {
  const resolved = resolveGrassBladeGeometryOptions(options);
  const size = resolveTerrainSize(resolved.area);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const bladeOffsets: number[] = [];
  const bladeVary: number[] = [];
  const bladeBendScale: number[] = [];
  const indices: number[] = [];

  // Blade layout inside the tuft is baked once from the seed, shared by every instance.
  const templateRandom = createSeededRandom(typeof resolved.seed === "number" ? resolved.seed + 7919 : `${resolved.seed}/tuft`);
  const vertsPerBlade = (resolved.segments + 1) * 2;
  for (let blade = 0; blade < resolved.tuftBlades; blade += 1) {
    // First blade anchors the root; the rest ring outward with jittered angle/radius.
    const angle = blade === 0 ? 0 : ((blade - 1) / Math.max(1, resolved.tuftBlades - 1)) * Math.PI * 2 + templateRandom() * 1.4;
    const radius = blade === 0 ? 0 : resolved.tuftRadius * (0.35 + 0.65 * templateRandom());
    const offsetX = Math.cos(angle) * radius;
    const offsetZ = Math.sin(angle) * radius;
    // Bend direction points away from the tuft center (plus jitter) so the clump splays open.
    const yaw = angle + Math.PI / 2 + (templateRandom() - 0.5) * 1.6;
    const heightScale = 0.72 + templateRandom() * 0.45;
    const widthScale = 0.8 + templateRandom() * 0.4;
    const phase = templateRandom();
    const bendScale = 0.7 + templateRandom() * 0.7;
    for (let segment = 0; segment <= resolved.segments; segment += 1) {
      const t = segment / resolved.segments;
      positions.push(-0.5, t, 0, 0.5, t, 0);
      normals.push(0, 0, 1, 0, 0, 1);
      uvs.push(0, t, 1, t);
      for (let corner = 0; corner < 2; corner += 1) {
        bladeOffsets.push(offsetX, offsetZ);
        bladeVary.push(yaw, heightScale, widthScale, phase);
        bladeBendScale.push(bendScale);
      }
      if (segment < resolved.segments) {
        const base = blade * vertsPerBlade + segment * 2;
        indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
      }
    }
  }

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("bladeOffset", new THREE.Float32BufferAttribute(bladeOffsets, 2));
  geometry.setAttribute("bladeVary", new THREE.Float32BufferAttribute(bladeVary, 4));
  geometry.setAttribute("bladeBendScale", new THREE.Float32BufferAttribute(bladeBendScale, 1));
  geometry.setIndex(indices);

  const tuftCount = grassTuftCount(resolved.count, resolved.tuftBlades);
  const random = createSeededRandom(resolved.seed);
  const offsets = new Float32Array(tuftCount * 3);
  const yaw = new Float32Array(tuftCount);
  const heights = new Float32Array(tuftCount);
  const widths = new Float32Array(tuftCount);
  const bend = new Float32Array(tuftCount);
  const phase = new Float32Array(tuftCount);
  const colorMix = new Float32Array(tuftCount);

  const halfW = size.width / 2;
  const halfD = size.depth / 2;
  for (let index = 0; index < tuftCount; index += 1) {
    const x = (random() - 0.5) * size.width;
    const z = (random() - 0.5) * size.depth;
    offsets[index * 3] = x;
    offsets[index * 3 + 1] = resolved.heightAt(x, z);
    offsets[index * 3 + 2] = z;
    yaw[index] = random() * Math.PI * 2;
    let heightScale = randomRange(random, resolved.height);
    // Two random draws happen on every path so the seeded stream stays aligned regardless of feather.
    const gate = random();
    const settle = random();
    if (resolved.edgeFeather > 0) {
      // Tufts drop out probabilistically across the feather band (mostly keeping full height),
      // so the border reads as grass growing sparser — not a mowed short-pile strip.
      const edge = Math.min(halfW - Math.abs(x), halfD - Math.abs(z));
      const inside = Math.min(1, Math.max(0, edge / resolved.edgeFeather));
      heightScale *= gate < inside * inside ? 0.7 + 0.3 * settle : 0;
    }
    for (const zone of resolved.exclude) {
      // Signed distance outside the rect: blades vanish inside and regrow across the feather ramp.
      const d = Math.max(Math.abs(x - zone.center[0]) - zone.half[0], Math.abs(z - zone.center[1]) - zone.half[1]);
      heightScale *= Math.min(1, Math.max(0, d / Math.max(0.001, zone.feather ?? 1.5)));
    }
    heights[index] = heightScale;
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
  geometry.instanceCount = tuftCount;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.max(size.width, size.depth) * 0.75 + resolved.height[1]);
  return geometry;
}

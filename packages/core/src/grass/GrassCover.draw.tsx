// @skill jgengine-world
import * as THREE from "three";

import { useDisposable } from "@jgengine/core/render/useDisposable.draw";
import { createGrassCoverGeometry, GRASS_COVER_MAX_SEGMENTS } from "./grassCoverGeometry.draw";
import type { TerrainHeightSampler } from "@jgengine/core/terrain/terrainMath.draw";

interface CoverGrain {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
}

let grain: CoverGrain | null = null;

/** Texels per side of the grain tile; it spans `GRASS_COVER_TILE_METRES`, so a texel is about a centimetre. */
const GRAIN_SIZE = 256;

function grainHash(x: number, y: number): number {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function grainTexture(data: Uint8Array): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, GRAIN_SIZE, GRAIN_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Tileable turf grain for the cover mat, generated once from a hash with no asset pull: thousands
 * of short centimetre blade strokes over darker gaps, as a colour map (luminance around 0.9) and a
 * matching normal map. Up close a short-cut mat reads as blades, and mipmaps calm it with distance.
 */
function coverGrain(): CoverGrain {
  if (grain !== null) return grain;
  const size = GRAIN_SIZE;
  const height = new Float32Array(size * size);
  for (let i = 0; i < height.length; i += 1) height[i] = grainHash(i % size, Math.floor(i / size)) * 0.25;
  const strokes = size * size * 0.2;
  for (let n = 0; n < strokes; n += 1) {
    const x0 = grainHash(n, 11) * size;
    const y0 = grainHash(n, 23) * size;
    const angle = grainHash(n, 37) * Math.PI * 2;
    const length = 1.5 + grainHash(n, 41) * 2.5;
    const peak = 0.55 + grainHash(n, 53) * 0.45;
    for (let t = 0; t <= length; t += 0.5) {
      const x = ((Math.round(x0 + Math.cos(angle) * t) % size) + size) % size;
      const y = ((Math.round(y0 + Math.sin(angle) * t) % size) + size) % size;
      const i = y * size + x;
      height[i] = Math.max(height[i] ?? 0, peak * (0.6 + 0.4 * (t / length)));
    }
  }
  const at = (x: number, y: number) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)] ?? 0;
  const colour = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const clump = (grainHash(x >> 3, y >> 3) - 0.5) * 18;
      const value = Math.max(170, Math.min(255, Math.round(192 + at(x, y) * 72 + clump)));
      colour[i] = value;
      colour[i + 1] = value;
      colour[i + 2] = value;
      colour[i + 3] = 255;
      const dx = (at(x + 1, y) - at(x - 1, y)) * 1.4;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 1.4;
      const length = Math.hypot(dx, dy, 1);
      normal[i] = Math.round((-dx / length) * 127.5 + 127.5);
      normal[i + 1] = Math.round((-dy / length) * 127.5 + 127.5);
      normal[i + 2] = Math.round((1 / length) * 127.5 + 127.5);
      normal[i + 3] = 255;
    }
  }
  const normalMap = grainTexture(normal);
  normalMap.repeat.set(2, 2);
  grain = { map: grainTexture(colour), normalMap };
  return grain;
}

/** Props for {@link GrassCover}: one authored patch's footprint, colours and drape samplers. */
export interface GrassCoverProps {
  area: readonly [number, number];
  seed: number;
  colorBase: THREE.ColorRepresentation;
  colorTip: THREE.ColorRepresentation;
  strength: number;
  edgeFeather: number;
  heightAt: TerrainHeightSampler;
  /** 0..1 mat coverage at a point, given the ground height there. */
  coverageAt: (x: number, z: number, height: number) => number;
  segments?: number;
  /** Metres the mat floats above the ground; keep it under the blade height or the mat hides the blades. Default 0.035. */
  lift?: number;
  /** Patch-local mow-stripe shade times contrast, -1..1; omit for an unstriped mat. */
  stripeAt?: TerrainHeightSampler | undefined;
  position?: readonly [number, number, number];
}

/**
 * The turf surface under one authored `grass_field` patch: a ground-draped, edge-feathered mat that
 * turns a bare pavement footprint into grass the blade field stands in. Bounded to one draw and a
 * {@link GRASS_COVER_MAX_SEGMENTS}² grid, so a large park still costs a single mesh.
 */
export function GrassCover({
  area,
  seed,
  colorBase,
  colorTip,
  strength,
  edgeFeather,
  heightAt,
  coverageAt,
  segments,
  lift,
  stripeAt,
  position,
}: GrassCoverProps) {
  const geometry = useDisposable(() => {
    const baked = createGrassCoverGeometry({
      area,
      seed,
      colorBase,
      colorTip,
      strength,
      edgeFeather,
      heightAt,
      coverageAt,
      ...(segments === undefined ? {} : { segments }),
      ...(lift === undefined ? {} : { lift }),
      ...(stripeAt === undefined ? {} : { stripeAt }),
    });
    const next = new THREE.BufferGeometry();
    if (baked.positions.length === 0) return next;
    next.setAttribute("position", new THREE.BufferAttribute(baked.positions, 3));
    next.setAttribute("normal", new THREE.BufferAttribute(baked.normals, 3));
    next.setAttribute("color", new THREE.BufferAttribute(baked.colors, 4));
    next.setAttribute("uv", new THREE.BufferAttribute(baked.uvs, 2));
    next.setIndex(new THREE.BufferAttribute(baked.indices, 1));
    next.computeBoundingSphere();
    return next;
  }, [area, seed, colorBase, colorTip, strength, edgeFeather, heightAt, coverageAt, segments, lift, stripeAt]);
  const material = useDisposable(
    () =>
      new THREE.MeshStandardMaterial({
        map: coverGrain().map,
        normalMap: coverGrain().normalMap,
        normalScale: new THREE.Vector2(0.5, 0.5),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        roughness: 0.96,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [],
  );
  if (strength <= 0) return null;
  return (
    <mesh
      geometry={geometry}
      material={material}
      receiveShadow
      frustumCulled
      {...(position === undefined ? {} : { position: [position[0], position[1], position[2]] as const })}
    />
  );
}

import * as THREE from "three";

import { useDisposable } from "../render/useDisposable";
import { createGrassCoverGeometry, GRASS_COVER_MAX_SEGMENTS } from "./grassCoverGeometry";
import type { TerrainHeightSampler } from "./terrainMath";

let grainTexture: THREE.DataTexture | null = null;

/**
 * Tileable thatch grain for the cover mat (luminance around 0.9), generated once from a hash — no
 * asset pull, deterministic, and cheap enough that a 96² mat still reads as grass up close.
 */
function coverGrain(): THREE.DataTexture {
  if (grainTexture !== null) return grainTexture;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const hash = (x: number, y: number) => {
    let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fine = (hash(x, y) + hash((x + 32) % size, (y + 17) % size)) * 0.5;
      const clump = (hash((x >> 2) * 3, (y >> 2) * 5) + hash(((x >> 2) + 7) % 16, ((y >> 2) + 3) % 16)) * 0.5;
      const value = Math.max(180, Math.min(255, Math.round(232 + (fine - 0.5) * 46 + (clump - 0.5) * 30)));
      const i = (y * size + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  grainTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  grainTexture.wrapS = THREE.RepeatWrapping;
  grainTexture.wrapT = THREE.RepeatWrapping;
  grainTexture.magFilter = THREE.LinearFilter;
  grainTexture.minFilter = THREE.LinearMipmapLinearFilter;
  grainTexture.generateMipmaps = true;
  grainTexture.needsUpdate = true;
  return grainTexture;
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
  coverageAt: TerrainHeightSampler;
  segments?: number;
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
  }, [area, seed, colorBase, colorTip, strength, edgeFeather, heightAt, coverageAt, segments]);
  const material = useDisposable(
    () =>
      new THREE.MeshStandardMaterial({
        map: coverGrain(),
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

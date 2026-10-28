import * as THREE from "three";

import { applyTriplanarProjection } from "@jgengine/core/material/triplanarMaterial.draw";
import { bakeSurfaceMaterialShared, surfaceMaterialStandardMaps } from "@jgengine/core/material/surfaceMaterialTextures.draw";
import type { NatureMesh, NatureSurface } from "./natureMesh";

/**
 * A three geometry for a nature mesh, its sRGB vertex colours converted to linear. The caller owns it.
 * @capability nature-generator seeded trees, palms, bushes, ferns, rocks and pebbles with editor variants and instanced scatter
 */
export function natureGeometry(mesh: NatureMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const colors = new Float32Array(mesh.colors.length);
  const color = new THREE.Color();
  for (let i = 0; i < colors.length; i += 3) {
    color.setRGB((mesh.colors[i] ?? 0), (mesh.colors[i + 1] ?? 0), (mesh.colors[i + 2] ?? 0), THREE.SRGBColorSpace);
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

let material: THREE.MeshStandardMaterial | null = null;
const surfaceMaterials = new Map<NatureSurface, THREE.MeshStandardMaterial>();

/** The generated surface each nature surface draws with, and the world metres one tile covers. */
const NATURE_SURFACES: Record<NatureSurface, { preset: string; tile: number }> = {
  rock: { preset: "rock", tile: 1.6 },
  bark: { preset: "bark", tile: 0.8 },
};

/**
 * A grain map: the baked albedo's brightness against its own mean, around 0.5, so the material
 * (colour 2) shades each mesh's own vertex colour instead of repainting it the map's hue.
 */
function grainTexture(albedo: Uint8Array, size: number): THREE.DataTexture {
  const count = size * size;
  let mean = 0;
  for (let i = 0; i < count; i += 1) mean += (albedo[i * 4] ?? 0) * 0.2126 + (albedo[i * 4 + 1] ?? 0) * 0.7152 + (albedo[i * 4 + 2] ?? 0) * 0.0722;
  mean = Math.max(1, mean / count);
  const data = new Uint8Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const lum = (albedo[i * 4] ?? 0) * 0.2126 + (albedo[i * 4 + 1] ?? 0) * 0.7152 + (albedo[i * 4 + 2] ?? 0) * 0.0722;
    const value = Math.round(Math.min(255, (lum / mean) * 127.5));
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function surfaceMaterial(surface: NatureSurface): THREE.MeshStandardMaterial {
  const cached = surfaceMaterials.get(surface);
  if (cached !== undefined) return cached;
  const look = NATURE_SURFACES[surface];
  const baked = bakeSurfaceMaterialShared({ preset: look.preset, seed: `nature-${surface}`, params: { resolution: "256" } });
  const maps = surfaceMaterialStandardMaps(baked);
  maps.map.dispose();
  const created = new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: new THREE.Color(2, 2, 2),
    map: grainTexture(baked.albedo, baked.size),
    normalMap: maps.normalMap,
    roughnessMap: maps.ormMap,
    aoMap: maps.ormMap,
    roughness: 1,
    metalness: 0,
  });
  applyTriplanarProjection(created, { tileMetres: look.tile, sharpness: 6, normalScale: 1 });
  surfaceMaterials.set(surface, created);
  return created;
}

/**
 * The material a nature mesh shares with every mesh of its surface: vertex colours, matte; leaf blades
 * carry both faces themselves. Rocks and wood (`surface`) add the generated rock or bark grain, normal,
 * roughness and AO, projected in world space so the meshes need no UVs.
 * @capability nature-generator seeded trees, palms, bushes, ferns, rocks and pebbles with editor variants and instanced scatter
 */
export function natureMaterial(surface?: NatureSurface): THREE.MeshStandardMaterial {
  if (surface !== undefined) return surfaceMaterial(surface);
  material ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  return material;
}

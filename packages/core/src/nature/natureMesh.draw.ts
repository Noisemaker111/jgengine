import * as THREE from "three";

import { applyTriplanarProjection } from "@jgengine/core/material/triplanarMaterial.draw";
import { bakeSurfaceMaterialSharedJob, surfaceMaterialStandardMaps } from "@jgengine/core/material/surfaceMaterialTextures.draw";
import type { SurfaceMaterialMaps } from "@jgengine/core/material/surfaceMaterialGenerator";
import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";
import { runSliced, SlicedWorkCancelled } from "@jgengine/core/run/slicedWork";
import type { NatureMesh, NatureSurface } from "./natureMesh";

/** A generated surface: a baked texture set projected in world space. */
type BakedSurface = Exclude<NatureSurface, "leaf">;

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
let leafMaterial: THREE.MeshStandardMaterial | null = null;
const surfaceMaterials = new Map<BakedSurface, THREE.MeshStandardMaterial>();

/** The generated surface each nature surface draws with, and the world metres one tile covers. */
const NATURE_SURFACES: Record<BakedSurface, { preset: string; tile: number }> = {
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

/** A 1x1 repeat texture of one texel value, standing in until the bake lands. */
function texel(r: number, g: number, b: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function applyBake(target: THREE.MeshStandardMaterial, baked: SurfaceMaterialMaps): void {
  const maps = surfaceMaterialStandardMaps(baked);
  maps.map.dispose();
  const placeholders = [target.map, target.normalMap, target.roughnessMap];
  // Same slots filled, so the program stays the one compiled with the placeholders.
  target.map = grainTexture(baked.albedo, baked.size);
  target.normalMap = maps.normalMap;
  target.roughnessMap = maps.ormMap;
  target.aoMap = maps.ormMap;
  for (const texture of placeholders) texture?.dispose();
}

function surfaceMaterial(surface: BakedSurface): THREE.MeshStandardMaterial {
  const cached = surfaceMaterials.get(surface);
  if (cached !== undefined) return cached;
  const look = NATURE_SURFACES[surface];
  const orm = texel(255, 255, 0);
  const created = new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: new THREE.Color(2, 2, 2),
    map: texel(128, 128, 128),
    normalMap: texel(128, 128, 255),
    roughnessMap: orm,
    aoMap: orm,
    roughness: 1,
    metalness: 0,
  });
  applyTriplanarProjection(created, { tileMetres: look.tile, sharpness: 6, normalScale: 1 });
  surfaceMaterials.set(surface, created);
  // Baked in slices so the first rock on screen never freezes the page; counts as scene loading.
  const done = trackSceneWork(`nature-${surface}-surface`);
  runSliced(bakeSurfaceMaterialSharedJob({ preset: look.preset, seed: `nature-${surface}`, params: { resolution: "256" } })).done.then(
    (baked) => {
      applyBake(created, baked);
      done();
    },
    (error: unknown) => {
      done();
      if (!(error instanceof SlicedWorkCancelled)) console.error(`[jgengine] nature ${surface} surface failed to bake`, error);
    },
  );
  return created;
}

/**
 * The material a nature mesh shares with every mesh of its surface: vertex colours, matte; frond
 * blades carry both faces themselves, while `"leaf"` blades are single-sided and lit from both faces.
 * Rocks and wood (`surface`) add the generated rock or bark grain, normal, roughness and AO,
 * projected in world space so the meshes need no UVs.
 * @capability nature-generator seeded trees, palms, bushes, ferns, rocks and pebbles with editor variants and instanced scatter
 */
export function natureMaterial(surface?: NatureSurface): THREE.MeshStandardMaterial {
  if (surface === "leaf") {
    leafMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
    return leafMaterial;
  }
  if (surface !== undefined) return surfaceMaterial(surface);
  material ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  return material;
}

/**
 * Every draw a nature mesh makes: one geometry and material per part (a tree's bark trunk, its
 * leaves), or one for a single-surface mesh. The caller owns and disposes the geometries.
 * @capability nature-generator seeded trees, palms, bushes, ferns, rocks and pebbles with editor variants and instanced scatter
 */
export function natureDraws(mesh: NatureMesh): { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }[] {
  const whole = natureGeometry(mesh);
  if (mesh.parts === undefined || mesh.parts.length === 0) return [{ geometry: whole, material: natureMaterial(mesh.surface) }];
  const draws = mesh.parts.map((part) => {
    const geometry = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "color"] as const) {
      const attribute = whole.getAttribute(name);
      if (attribute instanceof THREE.BufferAttribute) geometry.setAttribute(name, attribute.clone());
    }
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices.slice(part.start, part.start + part.count), 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return { geometry, material: natureMaterial(part.surface) };
  });
  whole.dispose();
  return draws;
}

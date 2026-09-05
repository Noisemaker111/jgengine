import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import type { BuildingSurfaceMaps, BuildingSurfaceMaterial } from "@jgengine/core/world/buildings";

import type { MaterialOverrideTextures } from "../materialOverride";

const SURFACE_ROLES = ["color", "normal", "roughness", "ao", "metalness"] as const;
type SurfaceRole = (typeof SURFACE_ROLES)[number];

/** A surface that names at least one map URL. */
export type TexturedBuildingSurface = BuildingSurfaceMaterial & { maps: BuildingSurfaceMaps };

/** True when the surface names at least one map URL, so the batch needs the textured path. */
export function surfaceHasMaps(surface: BuildingSurfaceMaterial | undefined): surface is TexturedBuildingSurface {
  if (surface?.maps === undefined) return false;
  return SURFACE_ROLES.some((role) => surface.maps?.[role] !== undefined);
}

/** A stable key for bucketing instances that share one surface (same colour, maps, tiling, and response). */
export function surfaceKey(surface: BuildingSurfaceMaterial | undefined): string {
  if (surface === undefined) return "";
  const repeat = surface.repeat === undefined ? 1 : surface.repeat;
  const maps = surface.maps === undefined ? "" : SURFACE_ROLES.map((role) => surface.maps?.[role] ?? "").join(",");
  const tiling = typeof repeat === "number" ? String(repeat) : repeat.join("x");
  return `${surface.color ?? ""}|${maps}|${tiling}|${surface.roughness ?? ""}|${surface.metalness ?? ""}`;
}

function repeatOf(surface: BuildingSurfaceMaterial): [number, number] {
  const repeat = surface.repeat ?? 1;
  return typeof repeat === "number" ? [repeat, repeat] : [repeat[0], repeat[1]];
}

const textureLoader = new THREE.TextureLoader();
const loads = new Map<string, Promise<THREE.Texture | null>>();

/** One shared decode per URL; a missing file (a pack without `ao.jpg`) resolves to null instead of failing the batch. */
function loadSurfaceTexture(url: string): Promise<THREE.Texture | null> {
  let pending = loads.get(url);
  if (pending === undefined) {
    pending = new Promise((resolve) => {
      textureLoader.load(
        url,
        (texture) => resolve(texture),
        undefined,
        () => resolve(null),
      );
    });
    loads.set(url, pending);
  }
  return pending;
}

/**
 * Loads a surface's PBR maps and returns per-caller clones configured to tile `repeat` times per
 * slot, or `undefined` until the first map arrives so the batch draws its flat colour meanwhile.
 * Clones share the decoded image, so two kinds using one map at different repeats cost one
 * download. Maps whose file is missing are skipped rather than failing the whole surface.
 * @internal
 */
export function useBuildingSurfaceTextures(
  surface: BuildingSurfaceMaterial | undefined,
): MaterialOverrideTextures | undefined {
  const maps = surface?.maps;
  const color = maps?.color;
  const normal = maps?.normal;
  const roughness = maps?.roughness;
  const ao = maps?.ao;
  const metalness = maps?.metalness;
  const urls = useMemo(() => {
    const record: Partial<Record<SurfaceRole, string>> = {};
    if (color !== undefined) record.color = color;
    if (normal !== undefined) record.normal = normal;
    if (roughness !== undefined) record.roughness = roughness;
    if (ao !== undefined) record.ao = ao;
    if (metalness !== undefined) record.metalness = metalness;
    return record;
  }, [color, normal, roughness, ao, metalness]);
  const [loaded, setLoaded] = useState<Partial<Record<SurfaceRole, THREE.Texture>> | undefined>(undefined);
  useEffect(() => {
    const entries = Object.entries(urls) as [SurfaceRole, string][];
    if (entries.length === 0) {
      setLoaded(undefined);
      return;
    }
    let cancelled = false;
    Promise.all(entries.map(([role, url]) => loadSurfaceTexture(url).then((texture) => [role, texture] as const))).then(
      (results) => {
        if (cancelled) return;
        const record: Partial<Record<SurfaceRole, THREE.Texture>> = {};
        for (const [role, texture] of results) if (texture !== null) record[role] = texture;
        setLoaded(Object.keys(record).length === 0 ? undefined : record);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [urls]);
  const [repeatX, repeatY] = surface === undefined ? [1, 1] : repeatOf(surface);
  const textures = useMemo(() => {
    if (loaded === undefined) return undefined;
    const out: MaterialOverrideTextures = {};
    for (const role of SURFACE_ROLES) {
      const source = loaded[role];
      if (source === undefined) continue;
      const texture = source.clone();
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.colorSpace = role === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.needsUpdate = true;
      out[role] = texture;
    }
    return out;
  }, [loaded, repeatX, repeatY]);
  useEffect(
    () => () => {
      if (textures === undefined) return;
      for (const role of SURFACE_ROLES) textures[role]?.dispose();
    },
    [textures],
  );
  return textures;
}

/** Applies a surface's colour, response, and loaded maps onto a standard or physical material in place. @internal */
export function applyBuildingSurface(
  material: THREE.MeshStandardMaterial,
  surface: BuildingSurfaceMaterial,
  textures: MaterialOverrideTextures | undefined,
): THREE.MeshStandardMaterial {
  if (surface.color !== undefined) material.color.set(surface.color);
  if (surface.roughness !== undefined) material.roughness = surface.roughness;
  if (surface.metalness !== undefined) material.metalness = surface.metalness;
  if (textures !== undefined) {
    if (textures.color !== undefined) material.map = textures.color;
    if (textures.normal !== undefined) material.normalMap = textures.normal;
    if (textures.roughness !== undefined) material.roughnessMap = textures.roughness;
    if (textures.ao !== undefined) material.aoMap = textures.ao;
    if (textures.metalness !== undefined) material.metalnessMap = textures.metalness;
    material.needsUpdate = true;
  }
  return material;
}

import { useEffect, useState } from "react";
import * as THREE from "three";

import type { TerrainMaterialMaps } from "@jgengine/core/world/features";

/** Decoded maps of one scanned surface, shared by every material that tiles it. */
export interface SurfaceScanTextures {
  color: THREE.Texture;
  normal: THREE.Texture;
  roughness?: THREE.Texture;
  ao?: THREE.Texture;
}

type ScanRole = keyof SurfaceScanTextures;

interface ScanEntry {
  refs: number;
  textures: SurfaceScanTextures | null;
  failed: boolean;
  listeners: Set<() => void>;
  loaded: THREE.Texture[];
}

const entries = new Map<string, ScanEntry>();

/** Loads one map; the default goes through `THREE.TextureLoader`. */
export type SurfaceScanLoader = (url: string, onLoad: (texture: THREE.Texture) => void, onError: () => void) => void;

const defaultLoader: SurfaceScanLoader = (url, onLoad, onError) => {
  new THREE.TextureLoader().load(url, onLoad, undefined, onError);
};
let loadMap: SurfaceScanLoader = defaultLoader;

/** Swap the map loader, e.g. for a test without a DOM; `null` restores the default. @internal */
export function setSurfaceScanLoader(loader: SurfaceScanLoader | null): void {
  loadMap = loader ?? defaultLoader;
}

function scanRoles(maps: TerrainMaterialMaps): readonly (readonly [ScanRole, string])[] {
  return [
    ["color", maps.color],
    ["normal", maps.normal],
    ...(maps.roughness === undefined ? [] : ([["roughness", maps.roughness]] as const)),
    ...(maps.ao === undefined ? [] : ([["ao", maps.ao]] as const)),
  ];
}

/** Stable identity of a scan's map set; two layers naming the same URLs share one decode. @internal */
export function surfaceScanKey(maps: TerrainMaterialMaps): string {
  return scanRoles(maps).map(([role, url]) => `${role}:${url}`).join("|");
}

function startLoad(key: string, maps: TerrainMaterialMaps, entry: ScanEntry): void {
  const roles = scanRoles(maps);
  const textures: Partial<SurfaceScanTextures> = {};
  let pending = roles.length;
  for (const [role, url] of roles) {
    loadMap(
      url,
      (texture) => {
        if (entries.get(key) !== entry || entry.failed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = role === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 8;
        textures[role] = texture;
        entry.loaded.push(texture);
        pending -= 1;
        if (pending === 0) {
          entry.textures = textures as SurfaceScanTextures;
          for (const listener of entry.listeners) listener();
        }
      },
      () => {
        if (entries.get(key) !== entry || entry.failed) return;
        entry.failed = true;
        console.warn(`[jgengine] surface scan maps did not load (${url}) — keeping the procedural surface. Pull the game's asset packs (\`bun run provision\`) to restore them.`);
        for (const listener of entry.listeners) listener();
      },
    );
  }
}

/**
 * Take a reference on a scan's decoded maps. The first holder starts the load; `onChange` fires once
 * the maps are ready or have failed. A missing map is a console warning and the scan stays `null`,
 * so the caller keeps its procedural surface. Release the handle on unmount; the last release frees
 * the GPU textures. @internal
 */
export function acquireSurfaceScan(maps: TerrainMaterialMaps, onChange: () => void): { current: () => SurfaceScanTextures | null; release: () => void } {
  const key = surfaceScanKey(maps);
  let entry = entries.get(key);
  if (entry === undefined) {
    entry = { refs: 0, textures: null, failed: false, listeners: new Set(), loaded: [] };
    entries.set(key, entry);
    startLoad(key, maps, entry);
  }
  const held = entry;
  held.refs += 1;
  held.listeners.add(onChange);
  let released = false;
  return {
    current: () => (held.failed ? null : held.textures),
    release: () => {
      if (released) return;
      released = true;
      held.listeners.delete(onChange);
      held.refs -= 1;
      if (held.refs > 0) return;
      entries.delete(key);
      for (const texture of held.loaded) texture.dispose();
    },
  };
}

/**
 * React handle on a scan's maps: `null` while loading, after a load failure, or when `maps` is
 * undefined or `enabled` is false (the `low` tier). Every component naming the same URLs shares
 * one decode.
 */
export function useSurfaceScan(maps: TerrainMaterialMaps | undefined, enabled = true): SurfaceScanTextures | null {
  const key = maps === undefined || !enabled ? null : surfaceScanKey(maps);
  const [state, setState] = useState<{ key: string | null; textures: SurfaceScanTextures | null }>({ key: null, textures: null });
  useEffect(() => {
    if (key === null || maps === undefined) return undefined;
    const handle = acquireSurfaceScan(maps, () => setState({ key, textures: handle.current() }));
    setState({ key, textures: handle.current() });
    return () => handle.release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state.textures : null;
}

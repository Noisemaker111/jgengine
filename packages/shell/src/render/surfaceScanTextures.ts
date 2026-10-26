import { useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import * as THREE from "three";

import type { TerrainMaterialMaps } from "@jgengine/core/world/features";

import { ImageTextureLoader } from "./imageTexture";
import { warmupWaitsFor } from "./shaderWarmup";

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
  /** Settles once the maps have loaded or failed. */
  settled: Promise<void>;
  settle: () => void;
}

const entries = new Map<string, ScanEntry>();

/** Loads one map; the default goes through {@link ImageTextureLoader}. */
export type SurfaceScanLoader = (url: string, onLoad: (texture: THREE.Texture) => void, onError: () => void) => void;

const defaultLoader: SurfaceScanLoader = (url, onLoad, onError) => {
  new ImageTextureLoader().load(url, onLoad, undefined, onError);
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
          entry.settle();
        }
      },
      () => {
        if (entries.get(key) !== entry || entry.failed) return;
        entry.failed = true;
        console.warn(`[jgengine] surface scan maps did not load (${url}) — keeping the procedural surface. Pull the game's asset packs (\`bun run provision\`) to restore them.`);
        for (const listener of entry.listeners) listener();
        entry.settle();
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
export function acquireSurfaceScan(maps: TerrainMaterialMaps, onChange: () => void): { current: () => SurfaceScanTextures | null; failed: () => boolean; settled: Promise<void>; release: () => void } {
  const key = surfaceScanKey(maps);
  let entry = entries.get(key);
  if (entry === undefined) {
    let settle = () => {};
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    entry = { refs: 0, textures: null, failed: false, listeners: new Set(), loaded: [], settled, settle };
    entries.set(key, entry);
    startLoad(key, maps, entry);
  }
  const held = entry;
  held.refs += 1;
  held.listeners.add(onChange);
  let released = false;
  return {
    current: () => (held.failed ? null : held.textures),
    failed: () => held.failed,
    settled: held.settled,
    release: () => {
      if (released) return;
      released = true;
      held.listeners.delete(onChange);
      held.refs -= 1;
      if (held.refs > 0) return;
      entries.delete(key);
      held.settle();
      for (const texture of held.loaded) texture.dispose();
    },
  };
}

/** A scan's maps as a component sees them. */
export interface SurfaceScanState {
  /** The decoded maps; `null` while loading, after a load failure, or when no scan was asked for. */
  textures: SurfaceScanTextures | null;
  /** True until the maps load or fail. A surface waiting on them stays hidden, so no program is linked for the look they replace. */
  pending: boolean;
}

/**
 * React handle on a scan's maps. `maps` undefined or `enabled` false (the `low` tier) asks for
 * none and is never pending. Every component naming the same URLs shares one decode. The scene's
 * shader warmup waits for the maps, and a caller hides its surface while `pending`, so the warmup
 * links only the scanned programs the first frame draws, not the procedural ones they replace.
 */
export function useSurfaceScan(maps: TerrainMaterialMaps | undefined, enabled = true): SurfaceScanState {
  const key = maps === undefined || !enabled ? null : surfaceScanKey(maps);
  const scene = useThree((three) => three.scene);
  const [state, setState] = useState<{ key: string | null; textures: SurfaceScanTextures | null; settled: boolean }>({ key: null, textures: null, settled: false });
  useEffect(() => {
    if (key === null || maps === undefined) return undefined;
    const handle = acquireSurfaceScan(maps, () => setState({ key, textures: handle.current(), settled: true }));
    const textures = handle.current();
    if (textures === null) warmupWaitsFor(scene, handle.settled);
    setState({ key, textures, settled: textures !== null || handle.failed() });
    return () => handle.release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (key === null) return { textures: null, pending: false };
  if (state.key !== key) return { textures: null, pending: true };
  return { textures: state.textures, pending: !state.settled };
}

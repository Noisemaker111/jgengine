import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";
import type { SurfaceMaterialMaps } from "@jgengine/core/material/surfaceMaterialGenerator";
import type { TerrainMaterialMaps } from "@jgengine/core/world/features";
import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";
import { runSliced, SlicedWorkCancelled, type SlicedRun } from "@jgengine/core/run/slicedWork";

import type { ResolvedTerrainSurfaces } from "./terrain";
import { createTerrainSurfaceTexturesJob, type TerrainSurfaceTextures } from "./terrainDetailMaterial.draw";
import { loadTerrainScan, TERRAIN_SCAN_SIZE, terrainScanKey, terrainScanRequests } from "./terrainScanMaps.draw";
import { MAX_TERRAIN_PAINT_LAYERS, type TerrainPaintSlot } from "./terrainSurfaces.draw";

const NO_SCANS: ReadonlyMap<string, SurfaceMaterialMaps> = new Map();
const loading = new Map<string, Promise<SurfaceMaterialMaps | undefined>>();

/** One shared decode per scan spec and size, matching the `useLoader` cache the hook path used. @internal */
export function loadSharedTerrainScan(maps: TerrainMaterialMaps, size: number): Promise<SurfaceMaterialMaps | undefined> {
  const key = `${size}|${terrainScanKey(maps)}`;
  const known = loading.get(key);
  if (known !== undefined) return known;
  const pending = loadTerrainScan(maps, size).catch((error: unknown) => {
    loading.delete(key);
    console.error(`[jgengine] terrain scan "${maps.color}" failed to load; its layer keeps the procedural look`, error);
    return undefined;
  });
  loading.set(key, pending);
  return pending;
}

/** What a terrain surface bake needs: the resolved surface roles, paint-layer scans and graphics tier. */
export interface TerrainSurfacesInput {
  detailSurfaces: ResolvedTerrainSurfaces | undefined;
  paintSlots: readonly TerrainPaintSlot[] | undefined;
  quality: GraphicsQuality;
}

/** The baked surface array plus whether scans or the bake are still in flight. */
export interface TerrainSurfacesSnapshot {
  surfaces: TerrainSurfaceTextures | undefined;
  pending: boolean;
}

function usableSurfaces(detail: ResolvedTerrainSurfaces | undefined, scans: ReadonlyMap<string, SurfaceMaterialMaps>): ResolvedTerrainSurfaces | undefined {
  if (detail === undefined) return undefined;
  const roles: ResolvedTerrainSurfaces = {};
  for (const role of ["ground", "sand", "rock"] as const) {
    const layer = detail[role];
    if (layer !== undefined && (layer.scan === undefined || scans.has(terrainScanKey(layer.scan)))) roles[role] = layer;
  }
  return roles;
}

/**
 * The draw-side form of `useTerrainSurfaces`: scans decode through the shared cache, the surface
 * bake runs in budgeted slices, and `sync` returns the current snapshot. `onChange` fires when an
 * async stage lands so the host can re-sync without polling.
 * @internal
 */
export function createTerrainSurfacesDriver(
  getInput: () => TerrainSurfacesInput,
  onChange?: () => void,
): { sync(): TerrainSurfacesSnapshot; dispose(): void } {
  let disposed = false;
  let scanGeneration = 0;
  let inputsSeen = false;
  let detailSurfaces: ResolvedTerrainSurfaces | undefined;
  let paintSlots: readonly TerrainPaintSlot[] | undefined;
  let quality: GraphicsQuality = "high";

  let size = TERRAIN_SCAN_SIZE;
  let paintScans: readonly (TerrainMaterialMaps | undefined)[] = [];
  let requests: TerrainMaterialMaps[] = [];
  let requestKey = "";
  let scansStartedFor = "";
  let loaded: { key: string; scans: ReadonlyMap<string, SurfaceMaterialMaps> } = { key: "", scans: NO_SCANS };

  let usable: ResolvedTerrainSurfaces | undefined;
  let usableDetail: ResolvedTerrainSurfaces | undefined | null = null;
  let usableScans: ReadonlyMap<string, SurfaceMaterialMaps> | null = null;

  let baked: TerrainSurfaceTextures | undefined;
  let bakeDone = false;
  let bakeRun: SlicedRun<TerrainSurfaceTextures | undefined> | null = null;
  let bakeUsable: ResolvedTerrainSurfaces | undefined;
  let bakeQuality: GraphicsQuality = "high";
  let bakePaintScans: readonly (TerrainMaterialMaps | undefined)[] = [];
  let bakeScans: ReadonlyMap<string, SurfaceMaterialMaps> = NO_SCANS;

  const recomputeDerived = () => {
    const next = getInput();
    detailSurfaces = next.detailSurfaces;
    paintSlots = next.paintSlots;
    quality = next.quality;
    inputsSeen = true;
    size = quality === "low" ? TERRAIN_SCAN_SIZE / 2 : TERRAIN_SCAN_SIZE;
    paintScans = Array.from({ length: MAX_TERRAIN_PAINT_LAYERS }, (_, i) => paintSlots?.[i]?.scan);
    requests = terrainScanRequests(detailSurfaces, paintScans);
    requestKey = `${size}|${requests.map(terrainScanKey).join("\n")}`;
  };

  const startScans = () => {
    scansStartedFor = requestKey;
    if (requests.length === 0) return;
    const gen = ++scanGeneration;
    const done = trackSceneWork("terrain-scans");
    void Promise.all(requests.map((maps) => loadSharedTerrainScan(maps, size))).then((results) => {
      done();
      if (disposed || gen !== scanGeneration) return;
      const scans = new Map<string, SurfaceMaterialMaps>();
      results.forEach((packed, index) => {
        const maps = requests[index];
        if (packed !== undefined && maps !== undefined) scans.set(terrainScanKey(maps), packed);
      });
      loaded = { key: requestKey, scans };
      onChange?.();
    });
  };

  const startBake = (scans: ReadonlyMap<string, SurfaceMaterialMaps>) => {
    bakeUsable = usable;
    bakeQuality = quality;
    bakePaintScans = paintScans;
    bakeScans = scans;
    const run = runSliced(
      createTerrainSurfaceTexturesJob(
        usable,
        quality === "low" ? 0.5 : 1,
        paintScans.map((maps) => (maps !== undefined && scans.has(terrainScanKey(maps)) ? maps : undefined)),
        scans,
      ),
    );
    bakeRun = run;
    const done = trackSceneWork("terrain-surfaces");
    run.done.then(
      (result) => {
        done();
        if (disposed || bakeRun !== run) return;
        bakeRun = null;
        baked = result ?? undefined;
        bakeDone = true;
        onChange?.();
      },
      (error: unknown) => {
        done();
        if (disposed || bakeRun !== run) return;
        bakeRun = null;
        if (!(error instanceof SlicedWorkCancelled)) console.error("[jgengine] terrain-surfaces failed to build", error);
      },
    );
  };

  const sync = (): TerrainSurfacesSnapshot => {
    if (disposed) return { surfaces: undefined, pending: false };
    const next = getInput();
    if (!inputsSeen || next.detailSurfaces !== detailSurfaces || next.paintSlots !== paintSlots || next.quality !== quality) {
      recomputeDerived();
      if (scansStartedFor !== requestKey) startScans();
    }
    const ready = requests.length === 0 || loaded.key === requestKey;
    const scans = ready ? loaded.scans : NO_SCANS;
    if (usableDetail !== detailSurfaces || usableScans !== scans) {
      usableDetail = detailSurfaces;
      usableScans = scans;
      usable = usableSurfaces(detailSurfaces, scans);
    }
    const needsBake = usable !== undefined || baked !== undefined || bakeRun !== null;
    const bakeCurrent =
      bakeUsable === usable &&
      bakeQuality === quality &&
      bakePaintScans === paintScans &&
      bakeScans === scans;
    if (needsBake && !bakeCurrent) {
      bakeRun?.cancel();
      startBake(scans);
    } else if (!needsBake && bakeRun !== null) {
      bakeRun.cancel();
      bakeRun = null;
    }
    const wantsRoles = detailSurfaces !== undefined && Object.keys(detailSurfaces).length > 0;
    const roleScans = Object.values(detailSurfaces ?? {}).some((layer) => layer?.scan !== undefined);
    return { surfaces: baked, pending: wantsRoles && (!bakeDone || (roleScans && !ready)) };
  };

  return {
    sync,
    dispose(): void {
      disposed = true;
      scanGeneration += 1;
      bakeRun?.cancel();
      bakeRun = null;
      baked = undefined;
    },
  };
}

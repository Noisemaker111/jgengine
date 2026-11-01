import { useEffect, useMemo, useState } from "react";

import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";
import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";
import { useSlicedValue } from "@jgengine/core/render/useSlicedValue.draw";
import type { SurfaceMaterialMaps } from "@jgengine/core/material/surfaceMaterialGenerator";
import type { TerrainMaterialMaps } from "@jgengine/core/world/features";

import type { ResolvedTerrainSurfaces } from "./terrain";
import { createTerrainSurfaceTexturesJob, type TerrainSurfaceTextures } from "./terrainDetailMaterial.draw";
import { loadTerrainScan, TERRAIN_SCAN_SIZE, terrainScanKey, terrainScanRequests } from "./terrainScanMaps.draw";
import { MAX_TERRAIN_PAINT_LAYERS, type TerrainPaintSlot } from "./terrainSurfaces.draw";

const NO_SCANS: ReadonlyMap<string, SurfaceMaterialMaps> = new Map();
const loading = new Map<string, Promise<SurfaceMaterialMaps | undefined>>();

function loadShared(maps: TerrainMaterialMaps, size: number): Promise<SurfaceMaterialMaps | undefined> {
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

/**
 * The terrain's baked surface array: generated roles, scanned roles and the scans its paint layers
 * name, stacked once. Scans decode first (counted as scene loading); until they answer the terrain
 * draws the layers procedurally, and a scan that fails to load is logged and stays procedural.
 */
export function useTerrainSurfaces(
  detailSurfaces: ResolvedTerrainSurfaces | undefined,
  paintSlots: readonly TerrainPaintSlot[] | undefined,
  quality: GraphicsQuality,
): { surfaces: TerrainSurfaceTextures | undefined; pending: boolean } {
  const size = quality === "low" ? TERRAIN_SCAN_SIZE / 2 : TERRAIN_SCAN_SIZE;
  const paintKey = Array.from({ length: MAX_TERRAIN_PAINT_LAYERS }, (_, i) => {
    const scan = paintSlots?.[i]?.scan;
    return scan === undefined ? "" : terrainScanKey(scan);
  }).join("\n");
  const paintScans = useMemo(
    () => Array.from({ length: MAX_TERRAIN_PAINT_LAYERS }, (_, i) => paintSlots?.[i]?.scan),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paintKey],
  );
  const requests = useMemo(() => terrainScanRequests(detailSurfaces, paintScans), [detailSurfaces, paintScans]);
  const requestKey = `${size}|${requests.map(terrainScanKey).join("\n")}`;
  const [loaded, setLoaded] = useState<{ key: string; scans: ReadonlyMap<string, SurfaceMaterialMaps> }>({ key: "", scans: NO_SCANS });
  useEffect(() => {
    if (requests.length === 0) return;
    let live = true;
    const done = trackSceneWork("terrain-scans");
    void Promise.all(requests.map((maps) => loadShared(maps, size))).then((results) => {
      done();
      if (!live) return;
      const scans = new Map<string, SurfaceMaterialMaps>();
      results.forEach((packed, index) => {
        const maps = requests[index];
        if (packed !== undefined && maps !== undefined) scans.set(terrainScanKey(maps), packed);
      });
      setLoaded({ key: requestKey, scans });
    });
    return () => {
      live = false;
      done();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);
  const ready = requests.length === 0 || loaded.key === requestKey;
  const scans = ready ? loaded.scans : NO_SCANS;
  const usable = useMemo(() => {
    if (detailSurfaces === undefined) return undefined;
    const roles: ResolvedTerrainSurfaces = {};
    for (const role of ["ground", "sand", "rock"] as const) {
      const layer = detailSurfaces[role];
      if (layer !== undefined && (layer.scan === undefined || scans.has(terrainScanKey(layer.scan)))) roles[role] = layer;
    }
    return roles;
  }, [detailSurfaces, scans]);
  const baked = useSlicedValue(
    "terrain-surfaces",
    () => createTerrainSurfaceTexturesJob(usable, quality === "low" ? 0.5 : 1, paintScans.map((maps) => (maps !== undefined && scans.has(terrainScanKey(maps)) ? maps : undefined)), scans),
    [usable, quality, paintScans, scans],
  );
  const wantsRoles = detailSurfaces !== undefined && Object.keys(detailSurfaces).length > 0;
  const roleScans = Object.values(detailSurfaces ?? {}).some((layer) => layer?.scan !== undefined);
  return { surfaces: baked ?? undefined, pending: wantsRoles && (baked === null || (roleScans && !ready)) };
}

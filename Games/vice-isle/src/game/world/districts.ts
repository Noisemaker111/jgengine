import { editorMarkerPosition, findEditorMarker } from "@jgengine/core/editor/index";

import { editorLayers } from "../../editorLayers";

export const WORLD_W = 640;
export const WORLD_D = 640;
export const SHORE_X = -210;

export interface District {
  id: string;
  label: string;
  center: readonly [number, number];
  radius: number;
}

export interface RoadSegment {
  from: readonly [number, number];
  to: readonly [number, number];
}

export interface AuthoredVehicleSpawn {
  id: string;
  catalogId: string;
  position: readonly [number, number, number];
  rotationY: number;
}

function markerXYZ(id: string): readonly [number, number, number] {
  const marker = findEditorMarker(editorLayers, id);
  if (marker === undefined) throw new Error(`vice-isle scene is missing marker "${id}"`);
  return editorMarkerPosition(marker);
}

export const DISTRICTS: readonly District[] = editorLayers.volumes
  .filter((volume) => volume.kind === "district")
  .map((volume) => ({
    id: volume.id,
    label: volume.label ?? volume.id,
    center: [volume.center.x, volume.center.z] as const,
    radius: volume.radius ?? 0,
  }));

export const ROADS: readonly RoadSegment[] = editorLayers.paths
  .filter((path) => path.kind === "road")
  .map((path) => {
    const from = path.points[0]!;
    const to = path.points[1]!;
    return { from: [from.x, from.z] as const, to: [to.x, to.z] as const };
  });

export interface RaceRoute {
  id: string;
  label: string;
  checkpoints: readonly (readonly [number, number])[];
}

export const RACE_ROUTES: readonly RaceRoute[] = editorLayers.paths
  .filter((path) => path.kind === "route")
  .map((path) => ({
    id: path.id,
    label: path.label ?? path.id,
    checkpoints: path.points.map((point) => [point.x, point.z] as const),
  }));

export const OCEAN_LOOP_ID = "race-loop";

export const RACE_CHECKPOINTS: readonly (readonly [number, number])[] =
  RACE_ROUTES.find((route) => route.id === OCEAN_LOOP_ID)?.checkpoints ?? [];

export const AUTHORED_VEHICLE_SPAWNS: readonly AuthoredVehicleSpawn[] = editorLayers.markers
  .filter((marker) => marker.kind === "vehicle_spawn")
  .flatMap((marker) => {
    const catalogId = typeof marker.meta?.assetId === "string" ? marker.meta.assetId : null;
    return catalogId === null
      ? []
      : [{
          id: marker.id,
          catalogId,
          position: editorMarkerPosition(marker),
          rotationY: marker.rotationY ?? 0,
        }];
  });

export const KINGPIN_POS: readonly [number, number, number] = markerXYZ("kingpin");
export const PLAYER_SPAWN: readonly [number, number, number] = markerXYZ("player_spawn");
export const MARCO_POS: readonly [number, number, number] = markerXYZ("marco");
export const GUNSHOP_POS: readonly [number, number, number] = markerXYZ("gunshop");
export const GARAGE_POS: readonly [number, number, number] = markerXYZ("garage");
export const DOCK_FIGHT_CENTER: readonly [number, number, number] = markerXYZ("dock_fight");
export const BRIEFCASE_POS: readonly [number, number, number] = markerXYZ("briefcase");
export const VCPD_POS: readonly [number, number, number] = markerXYZ("vcpd_station");
export const SAFEHOUSE_POS: readonly [number, number, number] = markerXYZ("safehouse");
export const CICADA_STAGE_POS: readonly [number, number, number] = markerXYZ("cicada_stage");

export interface BountySpot {
  id: string;
  label: string;
  position: readonly [number, number, number];
}

export const BOUNTY_SPOTS: readonly BountySpot[] = editorLayers.markers
  .filter((marker) => marker.kind === "bounty")
  .map((marker) => ({
    id: marker.id,
    label: marker.label ?? marker.id,
    position: editorMarkerPosition(marker),
  }));

export function districtAt(x: number, z: number): District | null {
  let best: District | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const d of DISTRICTS) {
    const dist = Math.hypot(x - d.center[0], z - d.center[1]);
    if (dist < d.radius && dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

export function roadPoints(spacing: number): readonly (readonly [number, number])[] {
  const points: (readonly [number, number])[] = [];
  for (const seg of ROADS) {
    const dx = seg.to[0] - seg.from[0];
    const dz = seg.to[1] - seg.from[1];
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.round(length / spacing));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      points.push([seg.from[0] + dx * t, seg.from[1] + dz * t]);
    }
  }
  return points;
}

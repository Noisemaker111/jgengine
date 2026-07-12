import type { EditorDocument, EditorMarker, EditorPath, EditorVolume } from "@jgengine/core/editor/index";

import { enemyById } from "./game/entities/enemies/catalog";
import { ROUTES, SIDE_POIS, SPUR_ROUTES } from "./game/world/level";

const LEASH_RADIUS = 46;
import {
  BLACK_MARKET_POS,
  CLAPTRAP_POS,
  MARCUS_VENDOR_POS,
  NEW_U_STATION,
  PLAYER_SPAWN,
  TRAVEL_STATIONS,
  ZED_VENDOR_POS,
} from "./game/world/sites";
import { ZONES } from "./game/world/zones";

const RESPAWN_SKIP_RADIUS = 38;
const DISCOVER_RADIUS = 8;
const VOLUME_HEIGHT = 24;

function xz(x: number, z: number, y = 0): { x: number; y: number; z: number } {
  return { x, y, z };
}

function zoneVolumes(): EditorVolume[] {
  const volumes: EditorVolume[] = [];
  for (const zone of ZONES) {
    volumes.push({
      id: `zone_${zone.id}`,
      kind: "zone",
      shape: "cylinder",
      center: xz(zone.center.x, zone.center.z),
      radius: zone.radius,
      height: VOLUME_HEIGHT,
      label: zone.name,
      color: "#38bdf8",
      meta: { zoneId: zone.id, level: zone.level },
    });
    volumes.push({
      id: `flatten_${zone.id}`,
      kind: "flatten",
      shape: "cylinder",
      center: xz(zone.center.x, zone.center.z),
      radius: zone.flattenRadius,
      height: 8,
      label: `${zone.name} flatten`,
      color: "#94a3b8",
      meta: { zoneId: zone.id },
    });

    zone.clusters.forEach((cluster, index) => {
      const cx = zone.center.x + cluster.offset.x;
      const cz = zone.center.z + cluster.offset.z;
      volumes.push({
        id: `cluster_${zone.id}_${index}_${cluster.catalogId}`,
        kind: "cluster",
        shape: "cylinder",
        center: xz(cx, cz),
        radius: cluster.radius,
        height: 14,
        label: `${cluster.catalogId}×${cluster.count}`,
        color: "#fb923c",
        meta: {
          zoneId: zone.id,
          catalogId: cluster.catalogId,
          count: cluster.count,
          level: zone.level,
        },
      });
      const enemy = enemyById(cluster.catalogId);
      if (enemy !== undefined) {
        volumes.push({
          id: `aggro_${zone.id}_${index}_${cluster.catalogId}`,
          kind: "aggro",
          shape: "cylinder",
          center: xz(cx, cz),
          radius: enemy.aggroRadius,
          height: 6,
          label: `${cluster.catalogId} aggro`,
          color: "#ef4444",
          meta: { catalogId: cluster.catalogId, aggroRadius: enemy.aggroRadius },
        });
        volumes.push({
          id: `leash_${zone.id}_${index}_${cluster.catalogId}`,
          kind: "leash",
          shape: "cylinder",
          center: xz(cx, cz),
          radius: LEASH_RADIUS,
          height: 4,
          label: `${cluster.catalogId} leash`,
          color: "#f59e0b",
          meta: { leashRadius: LEASH_RADIUS },
        });
        volumes.push({
          id: `respawn_skip_${zone.id}_${index}_${cluster.catalogId}`,
          kind: "respawn_skip",
          shape: "cylinder",
          center: xz(cx, cz),
          radius: RESPAWN_SKIP_RADIUS,
          height: 3,
          label: "respawn skip",
          color: "#64748b",
          meta: { radius: RESPAWN_SKIP_RADIUS },
        });
      }
    });
  }
  return volumes;
}

function zoneMarkers(): EditorMarker[] {
  const markers: EditorMarker[] = [];
  for (const zone of ZONES) {
    if (zone.boss !== undefined) {
      const enemy = enemyById(zone.boss.catalogId);
      markers.push({
        id: zone.boss.instanceId,
        kind: "boss",
        position: xz(zone.boss.x, zone.boss.z),
        label: enemy?.name ?? zone.boss.catalogId,
        color: "#f43f5e",
        meta: {
          catalogId: zone.boss.catalogId,
          zoneId: zone.id,
          aggroRadius: enemy?.aggroRadius,
        },
      });
      if (enemy !== undefined) {
        // boss aggro/leash volumes attached as separate volumes below via side effect
      }
    }
    for (const [index, chest] of zone.chests.entries()) {
      markers.push({
        id: `chest_${zone.id}_${chest.kind}_${index}`,
        kind: "chest",
        position: xz(chest.x, chest.z),
        label: `${chest.kind} chest`,
        color: chest.kind === "red" ? "#fbbf24" : "#94a3b8",
        meta: { kind: chest.kind, zoneId: zone.id },
      });
    }
  }
  return markers;
}

function bossRangeVolumes(): EditorVolume[] {
  const volumes: EditorVolume[] = [];
  for (const zone of ZONES) {
    if (zone.boss === undefined) continue;
    const enemy = enemyById(zone.boss.catalogId);
    if (enemy === undefined) continue;
    volumes.push({
      id: `aggro_${zone.boss.instanceId}`,
      kind: "aggro",
      shape: "cylinder",
      center: xz(zone.boss.x, zone.boss.z),
      radius: enemy.aggroRadius,
      height: 8,
      label: `${zone.boss.catalogId} aggro`,
      color: "#ef4444",
      meta: { instanceId: zone.boss.instanceId, aggroRadius: enemy.aggroRadius },
    });
    volumes.push({
      id: `leash_${zone.boss.instanceId}`,
      kind: "leash",
      shape: "cylinder",
      center: xz(zone.boss.x, zone.boss.z),
      radius: LEASH_RADIUS,
      height: 5,
      label: `${zone.boss.catalogId} leash`,
      color: "#f59e0b",
      meta: { instanceId: zone.boss.instanceId, leashRadius: LEASH_RADIUS },
    });
  }
  return volumes;
}

function siteMarkers(): EditorMarker[] {
  return [
    {
      id: "player_spawn",
      kind: "player_spawn",
      position: xz(PLAYER_SPAWN[0], PLAYER_SPAWN[2]),
      label: "Player spawn",
      color: "#22d3ee",
    },
    {
      id: "claptrap",
      kind: "npc",
      position: xz(CLAPTRAP_POS[0], CLAPTRAP_POS[2]),
      label: "Claptrap",
      color: "#60a5fa",
    },
    {
      id: "vendor_marcus",
      kind: "vendor",
      position: xz(MARCUS_VENDOR_POS[0], MARCUS_VENDOR_POS[2]),
      label: "Marcus",
      color: "#a78bfa",
    },
    {
      id: "vendor_zed",
      kind: "vendor",
      position: xz(ZED_VENDOR_POS[0], ZED_VENDOR_POS[2]),
      label: "Dr. Zed",
      color: "#a78bfa",
    },
    {
      id: "vendor_black_market",
      kind: "vendor",
      position: xz(BLACK_MARKET_POS[0], BLACK_MARKET_POS[2]),
      label: "Black Market",
      color: "#a78bfa",
    },
    {
      id: "new_u_station",
      kind: "travel",
      position: xz(NEW_U_STATION[0], NEW_U_STATION[2]),
      label: "New-U",
      color: "#34d399",
    },
    ...TRAVEL_STATIONS.map((station) => ({
      id: `travel_${station.zoneId}`,
      kind: "travel" as const,
      position: xz(station.x, station.z),
      label: `${station.name} travel`,
      color: "#34d399",
      meta: { zoneId: station.zoneId },
    })),
  ];
}

function travelDiscoverVolumes(): EditorVolume[] {
  return TRAVEL_STATIONS.map((station) => ({
    id: `discover_${station.zoneId}`,
    kind: "discover",
    shape: "cylinder" as const,
    center: xz(station.x, station.z),
    radius: DISCOVER_RADIUS,
    height: 6,
    label: `${station.name} discover`,
    color: "#4ade80",
    meta: { zoneId: station.zoneId, radius: DISCOVER_RADIUS },
  }));
}

function poiLayers(): { markers: EditorMarker[]; volumes: EditorVolume[] } {
  const markers: EditorMarker[] = [];
  const volumes: EditorVolume[] = [];
  for (const poi of SIDE_POIS) {
    markers.push({
      id: poi.id,
      kind: "poi",
      position: xz(poi.x, poi.z),
      label: poi.name,
      color: "#e879f9",
      meta: { dressing: poi.dressing, spawns: poi.spawns, anchorZoneId: poi.anchorZoneId },
    });
    volumes.push({
      id: `poi_radius_${poi.id}`,
      kind: "poi",
      shape: "cylinder",
      center: xz(poi.x, poi.z),
      radius: poi.radius,
      height: 12,
      label: poi.name,
      color: "#e879f9",
      meta: { poiId: poi.id },
    });
  }
  return { markers, volumes };
}

function routePaths(): EditorPath[] {
  return [...ROUTES, ...SPUR_ROUTES].map((route) => ({
    id: `road_${route.from}_${route.to}`,
    kind: "road",
    points: route.points.map((point) => xz(point.x, point.z, 1)),
    width: 8,
    label: `${route.from} → ${route.to}`,
    color: "#cbd5e1",
    meta: { from: route.from, to: route.to },
  }));
}

export function buildBorderlands2EditorLayers(): EditorDocument {
  const poi = poiLayers();
  return {
    version: 1,
    markers: [...zoneMarkers(), ...siteMarkers(), ...poi.markers],
    volumes: [...zoneVolumes(), ...bossRangeVolumes(), ...travelDiscoverVolumes(), ...poi.volumes],
    paths: routePaths(),
    annotations: [],
  };
}

export const editorLayers = buildBorderlands2EditorLayers;

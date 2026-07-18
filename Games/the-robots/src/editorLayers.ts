import {
  normalizeEditorLayers,
  type EditorDocument,
  type EditorLayersInput,
  type EditorVolume,
} from "@jgengine/core/editor/index";

import sceneJson from "./editor.scene.json";
import { enemyById } from "./game/entities/enemies/catalog";
import { TRAVEL_STATIONS } from "./game/world/sites";
import { ZONES } from "./game/world/zones";

/**
 * Authored spatial content lives in `editor.scene.json` (zones, clusters, chests, bosses, travel,
 * vendors, POIs, props, roads). This module loads that document and appends derived AI volumes
 * (aggro / leash / respawn-skip / discover) whose radii come from enemy catalogs and constants —
 * not placeable layout.
 */
const LEASH_RADIUS = 46;
const RESPAWN_SKIP_RADIUS = 38;
const DISCOVER_RADIUS = 8;

function xz(x: number, z: number, y = 0): { x: number; y: number; z: number } {
  return { x, y, z };
}

/** Volumes whose sizes depend on AI tuning catalogs, projected onto scene-resolved centers. */
function derivedAiVolumes(): EditorVolume[] {
  const volumes: EditorVolume[] = [];

  for (const zone of ZONES) {
    zone.clusters.forEach((cluster, index) => {
      const enemy = enemyById(cluster.catalogId);
      if (enemy === undefined) return;
      const { x: cx, z: cz } = cluster.center;
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
    });

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

  for (const station of TRAVEL_STATIONS) {
    volumes.push({
      id: `discover_${station.zoneId}`,
      kind: "discover",
      shape: "cylinder",
      center: xz(station.x, station.z),
      radius: DISCOVER_RADIUS,
      height: 6,
      label: `${station.name} discover`,
      color: "#4ade80",
      meta: { zoneId: station.zoneId, radius: DISCOVER_RADIUS },
    });
  }

  return volumes;
}

export function buildTheRobotsEditorLayers(): EditorDocument {
  const scene = normalizeEditorLayers(sceneJson as unknown as EditorLayersInput);
  return {
    ...scene,
    volumes: [...scene.volumes, ...derivedAiVolumes()],
  };
}

export const editorLayers = buildTheRobotsEditorLayers;

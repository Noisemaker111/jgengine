import {
  findEditorMarker,
  findEditorVolume,
  normalizeEditorLayers,
  type EditorDocument,
  type EditorLayersInput,
} from "@jgengine/core/editor/index";
import sceneJson from "../../editor.scene.json";

/** Shared scene document — spatial placement for zones, clusters, chests, bosses, travel. */
const sceneDoc: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorLayersInput);

export interface ZoneCluster {
  catalogId: string;
  count: number;
  /** Absolute cluster center resolved from the authored scene volume. */
  center: { x: number; z: number };
  radius: number;
}

export interface ZoneChest {
  kind: "red" | "ammo";
  x: number;
  z: number;
}

export interface ZoneBoss {
  catalogId: string;
  instanceId: string;
  x: number;
  z: number;
}

export interface ZoneDef {
  id: string;
  name: string;
  center: { x: number; z: number };
  radius: number;
  level: number;
  flattenRadius: number;
  settlement?: {
    count: number;
    footprint: number;
    stories: readonly [number, number];
    style: "desert" | "ruin";
    palette?: { wall: string; storefront?: string };
  };
  clusters: readonly ZoneCluster[];
  chests: readonly ZoneChest[];
  boss?: ZoneBoss;
  travelStation: { x: number; z: number };
}

/** Non-spatial zone catalog: names, levels, settlement recipes, spawn composition. */
interface ZoneMeta {
  id: string;
  name: string;
  level: number;
  settlement?: ZoneDef["settlement"];
  clusters: readonly { catalogId: string; count: number }[];
  chests: readonly { kind: "red" | "ammo" }[];
  boss?: { catalogId: string; instanceId: string };
}

const ZONE_META: readonly ZoneMeta[] = [
  {
    id: "windshear_waste",
    name: "Rustflat Waste",
    level: 1,
    settlement: { count: 4, footprint: 6, stories: [1, 1], style: "ruin", palette: { wall: "#8a5c3a", storefront: "#4a3524" } },
    clusters: [
      { catalogId: "bullymong", count: 4 },
      { catalogId: "bullymong_brat", count: 5 },
    ],
    chests: [{ kind: "red" }, { kind: "ammo" }],
  },
  {
    id: "southern_shelf",
    name: "Southern Shelf",
    level: 4,
    settlement: { count: 8, footprint: 7, stories: [1, 2], style: "desert", palette: { wall: "#7d8894", storefront: "#3a4450" } },
    clusters: [
      { catalogId: "psycho", count: 5 },
      { catalogId: "marauder", count: 4 },
      { catalogId: "nomad", count: 2 },
      { catalogId: "bullymong", count: 3 },
    ],
    chests: [{ kind: "red" }, { kind: "ammo" }],
    boss: { catalogId: "captain_rusk", instanceId: "boss_rusk" },
  },
  {
    id: "arid_badlands",
    name: "Arid Badlands — Coretown",
    level: 8,
    settlement: { count: 10, footprint: 7, stories: [1, 2], style: "desert", palette: { wall: "#a06a3c", storefront: "#5a3b1e" } },
    clusters: [
      { catalogId: "skag_pup", count: 5 },
      { catalogId: "skag", count: 4 },
      { catalogId: "badass_skag", count: 1 },
      { catalogId: "psycho", count: 5 },
      { catalogId: "marauder", count: 4 },
      { catalogId: "badass_psycho", count: 1 },
    ],
    chests: [{ kind: "red" }, { kind: "ammo" }, { kind: "ammo" }],
  },
  {
    id: "three_horns",
    name: "Three Horns Divide",
    level: 12,
    settlement: { count: 6, footprint: 6, stories: [1, 1], style: "ruin", palette: { wall: "#7d6b52", storefront: "#43392c" } },
    clusters: [
      { catalogId: "marauder", count: 5 },
      { catalogId: "nomad", count: 3 },
      { catalogId: "spiderant", count: 5 },
      { catalogId: "spiderant_soldier", count: 3 },
    ],
    chests: [{ kind: "red" }, { kind: "ammo" }],
    boss: { catalogId: "bad_maw", instanceId: "boss_bad_maw" },
  },
  {
    id: "the_dust",
    name: "The Dust",
    level: 17,
    settlement: { count: 5, footprint: 8, stories: [1, 2], style: "desert", palette: { wall: "#96702a" } },
    clusters: [
      { catalogId: "spiderant", count: 4 },
      { catalogId: "spiderant_soldier", count: 3 },
      { catalogId: "badass_psycho", count: 2 },
      { catalogId: "marauder", count: 5 },
      { catalogId: "nomad", count: 3 },
    ],
    chests: [{ kind: "red" }, { kind: "ammo" }],
  },
  {
    id: "eridium_blight",
    name: "Cores Blight — Ember Gate",
    level: 24,
    settlement: { count: 7, footprint: 9, stories: [2, 4], style: "ruin" },
    clusters: [
      { catalogId: "loader", count: 5 },
      { catalogId: "loader_war", count: 3 },
      { catalogId: "loader", count: 4 },
      { catalogId: "badass_loader", count: 1 },
    ],
    chests: [{ kind: "red" }, { kind: "red" }, { kind: "ammo" }],
    boss: { catalogId: "the_warrior", instanceId: "boss_warrior" },
  },
];

function requireVolume(id: string) {
  const volume = findEditorVolume(sceneDoc, id);
  if (volume === undefined) throw new Error(`editor.scene.json: missing volume "${id}"`);
  if (volume.radius === undefined) throw new Error(`editor.scene.json: volume "${id}" has no radius`);
  return volume;
}

function requireMarker(id: string) {
  const marker = findEditorMarker(sceneDoc, id);
  if (marker === undefined) throw new Error(`editor.scene.json: missing marker "${id}"`);
  return marker;
}

/** Zones — metadata in code, spatial placement read from `editor.scene.json`. */
export const ZONES: readonly ZoneDef[] = ZONE_META.map((meta) => {
  const zoneVol = requireVolume(`zone_${meta.id}`);
  const flattenVol = requireVolume(`flatten_${meta.id}`);
  const travel = requireMarker(`travel_${meta.id}`);

  const clusters: ZoneCluster[] = meta.clusters.map((cluster, index) => {
    const volume = requireVolume(`cluster_${meta.id}_${index}_${cluster.catalogId}`);
    return {
      catalogId: cluster.catalogId,
      count: cluster.count,
      center: { x: volume.center.x, z: volume.center.z },
      radius: volume.radius!,
    };
  });

  const chests: ZoneChest[] = meta.chests.map((chest, index) => {
    const marker = requireMarker(`chest_${meta.id}_${chest.kind}_${index}`);
    return { kind: chest.kind, x: marker.position.x, z: marker.position.z };
  });

  let boss: ZoneBoss | undefined;
  if (meta.boss !== undefined) {
    const marker = requireMarker(meta.boss.instanceId);
    boss = {
      catalogId: meta.boss.catalogId,
      instanceId: meta.boss.instanceId,
      x: marker.position.x,
      z: marker.position.z,
    };
  }

  return {
    id: meta.id,
    name: meta.name,
    center: { x: zoneVol.center.x, z: zoneVol.center.z },
    radius: zoneVol.radius!,
    level: meta.level,
    flattenRadius: flattenVol.radius!,
    settlement: meta.settlement,
    clusters,
    chests,
    boss,
    travelStation: { x: travel.position.x, z: travel.position.z },
  };
});

export const WORLD_BOUNDS = { w: 1500, d: 1500 } as const;

export const HUB_ZONE_ID = "arid_badlands";

export function zoneById(id: string): ZoneDef | undefined {
  return ZONES.find((zone) => zone.id === id);
}

export function zoneAt(x: number, z: number): ZoneDef | null {
  let best: ZoneDef | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const zone of ZONES) {
    const distance = Math.hypot(x - zone.center.x, z - zone.center.z);
    if (distance <= zone.radius && distance < bestDistance) {
      best = zone;
      bestDistance = distance;
    }
  }
  return best;
}

export function zoneLevelAt(x: number, z: number): number {
  const zone = zoneAt(x, z);
  if (zone !== null) return zone.level;
  let nearest = ZONES[0]!;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const zone of ZONES) {
    const distance = Math.hypot(x - zone.center.x, z - zone.center.z);
    if (distance < nearestDistance) {
      nearest = zone;
      nearestDistance = distance;
    }
  }
  return nearest.level;
}

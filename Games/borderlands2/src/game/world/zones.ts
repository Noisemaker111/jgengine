export interface ZoneCluster {
  catalogId: string;
  count: number;
  offset: { x: number; z: number };
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

export const WORLD_BOUNDS = { w: 1500, d: 1500 } as const;

export const ZONES: readonly ZoneDef[] = [
  {
    id: "windshear_waste",
    name: "Windshear Waste",
    center: { x: -520, z: 560 },
    radius: 150,
    level: 1,
    flattenRadius: 70,
    settlement: { count: 4, footprint: 6, stories: [1, 1], style: "ruin", palette: { wall: "#8a5c3a", storefront: "#4a3524" } },
    clusters: [
      { catalogId: "bullymong", count: 4, offset: { x: 40, z: -30 }, radius: 25 },
      { catalogId: "bullymong_brat", count: 5, offset: { x: -35, z: 40 }, radius: 22 },
    ],
    chests: [
      { kind: "red", x: -480, z: 610 },
      { kind: "ammo", x: -540, z: 530 },
    ],
    travelStation: { x: -520, z: 560 },
  },
  {
    id: "southern_shelf",
    name: "Southern Shelf",
    center: { x: -180, z: 460 },
    radius: 190,
    level: 4,
    flattenRadius: 80,
    settlement: { count: 8, footprint: 7, stories: [1, 2], style: "desert", palette: { wall: "#7d8894", storefront: "#3a4450" } },
    clusters: [
      { catalogId: "psycho", count: 5, offset: { x: 70, z: -40 }, radius: 31 },
      { catalogId: "marauder", count: 4, offset: { x: 70, z: -40 }, radius: 31 },
      { catalogId: "nomad", count: 2, offset: { x: 110, z: 20 }, radius: 22 },
      { catalogId: "bullymong", count: 3, offset: { x: -80, z: 60 }, radius: 28 },
    ],
    chests: [
      { kind: "red", x: -100, z: 520 },
      { kind: "ammo", x: -210, z: 420 },
    ],
    boss: { catalogId: "captain_flynt", instanceId: "boss_flynt", x: -60, z: 560 },
    travelStation: { x: -190, z: 440 },
  },
  {
    id: "arid_badlands",
    name: "Arid Badlands — Fyrestone",
    center: { x: 0, z: 0 },
    radius: 240,
    level: 8,
    flattenRadius: 90,
    settlement: { count: 10, footprint: 7, stories: [1, 2], style: "desert", palette: { wall: "#a06a3c", storefront: "#5a3b1e" } },
    clusters: [
      { catalogId: "skag_pup", count: 5, offset: { x: -70, z: 110 }, radius: 28 },
      { catalogId: "skag", count: 4, offset: { x: -70, z: 110 }, radius: 28 },
      { catalogId: "badass_skag", count: 1, offset: { x: -70, z: 110 }, radius: 17 },
      { catalogId: "psycho", count: 5, offset: { x: 120, z: 60 }, radius: 34 },
      { catalogId: "marauder", count: 4, offset: { x: 120, z: 60 }, radius: 34 },
      { catalogId: "badass_psycho", count: 1, offset: { x: 120, z: 60 }, radius: 17 },
    ],
    chests: [
      { kind: "red", x: 90, z: 55 },
      { kind: "ammo", x: 16, z: -46 },
      { kind: "ammo", x: 115, z: 70 },
    ],
    travelStation: { x: -14, z: -20 },
  },
  {
    id: "three_horns",
    name: "Three Horns Divide",
    center: { x: 420, z: 300 },
    radius: 220,
    level: 12,
    flattenRadius: 70,
    settlement: { count: 6, footprint: 6, stories: [1, 1], style: "ruin", palette: { wall: "#7d6b52", storefront: "#43392c" } },
    clusters: [
      { catalogId: "marauder", count: 5, offset: { x: -60, z: -50 }, radius: 34 },
      { catalogId: "nomad", count: 3, offset: { x: -60, z: -50 }, radius: 25 },
      { catalogId: "spiderant", count: 5, offset: { x: 80, z: 70 }, radius: 31 },
      { catalogId: "spiderant_soldier", count: 3, offset: { x: 80, z: 70 }, radius: 25 },
    ],
    chests: [
      { kind: "red", x: 470, z: 250 },
      { kind: "ammo", x: 380, z: 340 },
    ],
    boss: { catalogId: "bad_maw", instanceId: "boss_bad_maw", x: 500, z: 380, },
    travelStation: { x: 420, z: 290 },
  },
  {
    id: "the_dust",
    name: "The Dust",
    center: { x: 520, z: -260 },
    radius: 230,
    level: 17,
    flattenRadius: 70,
    settlement: { count: 5, footprint: 8, stories: [1, 2], style: "desert", palette: { wall: "#96702a" } },
    clusters: [
      { catalogId: "spiderant", count: 4, offset: { x: -90, z: 40 }, radius: 31 },
      { catalogId: "spiderant_soldier", count: 3, offset: { x: -90, z: 40 }, radius: 25 },
      { catalogId: "badass_psycho", count: 2, offset: { x: 70, z: -60 }, radius: 25 },
      { catalogId: "marauder", count: 5, offset: { x: 70, z: -60 }, radius: 34 },
      { catalogId: "nomad", count: 3, offset: { x: 10, z: 90 }, radius: 25 },
    ],
    chests: [
      { kind: "red", x: 570, z: -210 },
      { kind: "ammo", x: 470, z: -300 },
    ],
    travelStation: { x: 520, z: -270 },
  },
  {
    id: "eridium_blight",
    name: "Eridium Blight — Hero's Pass",
    center: { x: -80, z: -560 },
    radius: 220,
    level: 24,
    flattenRadius: 90,
    settlement: { count: 7, footprint: 9, stories: [2, 4], style: "ruin" },
    clusters: [
      { catalogId: "loader", count: 5, offset: { x: 60, z: 40 }, radius: 31 },
      { catalogId: "loader_war", count: 3, offset: { x: 60, z: 40 }, radius: 25 },
      { catalogId: "loader", count: 4, offset: { x: -80, z: -50 }, radius: 31 },
      { catalogId: "badass_loader", count: 1, offset: { x: -80, z: -50 }, radius: 17 },
    ],
    chests: [
      { kind: "red", x: -20, z: -510 },
      { kind: "red", x: -140, z: -610 },
      { kind: "ammo", x: -80, z: -540 },
    ],
    boss: { catalogId: "the_warrior", instanceId: "boss_warrior", x: -80, z: -660 },
    travelStation: { x: -80, z: -520 },
  },
];

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

import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { ZONES, zoneById, type ZoneDef } from "./zones";

export interface RoutePoint {
  x: number;
  z: number;
  t: number;
}

export interface Route {
  from: string;
  to: string;
  points: readonly RoutePoint[];
}

const ZONE_CHAIN: readonly (readonly [string, string])[] = [
  ["windshear_waste", "southern_shelf"],
  ["southern_shelf", "arid_badlands"],
  ["arid_badlands", "three_horns"],
  ["three_horns", "the_dust"],
  ["arid_badlands", "eridium_blight"],
];

export interface SidePoi {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  anchorZoneId: string;
  dressing: "skag_den" | "cache" | "wreck_field";
  spawns: readonly { catalogId: string; count: number }[];
}

export const SIDE_POIS: readonly SidePoi[] = [
  {
    id: "poi_monglet_den",
    name: "Monglet Den",
    x: -640,
    z: 430,
    radius: 26,
    anchorZoneId: "windshear_waste",
    dressing: "skag_den",
    spawns: [{ catalogId: "bullymong_brat", count: 4 }, { catalogId: "bullymong", count: 2 }],
  },
  {
    id: "poi_lost_cache",
    name: "Lost Apex Cache",
    x: 180,
    z: 210,
    radius: 22,
    anchorZoneId: "arid_badlands",
    dressing: "cache",
    spawns: [{ catalogId: "loader", count: 3 }],
  },
  {
    id: "poi_wreck_field",
    name: "Buzzard Wreck Field",
    x: 640,
    z: 40,
    radius: 28,
    anchorZoneId: "the_dust",
    dressing: "wreck_field",
    spawns: [{ catalogId: "marauder", count: 3 }, { catalogId: "psycho", count: 3 }],
  },
];

function buildRoute(fromId: string, toId: string): Route {
  const from = zoneById(fromId)!;
  const to = zoneById(toId)!;
  const rng = seededRng(`bl2-road-${fromId}-${toId}`);
  const dx = to.center.x - from.center.x;
  const dz = to.center.z - from.center.z;
  const length = Math.hypot(dx, dz);
  const steps = Math.max(4, Math.round(length / 12));
  const normalX = -dz / length;
  const normalZ = dx / length;
  const amplitude = 10 + rng() * 10;
  const phase = rng() * Math.PI;
  const points: RoutePoint[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const wobble = Math.sin(t * Math.PI * 2 + phase) * amplitude * Math.sin(t * Math.PI);
    points.push({
      x: from.center.x + dx * t + normalX * wobble,
      z: from.center.z + dz * t + normalZ * wobble,
      t,
    });
  }
  return { from: fromId, to: toId, points };
}

export const ROUTES: readonly Route[] = ZONE_CHAIN.map(([from, to]) => buildRoute(from, to));

function buildSpur(poi: SidePoi): Route {
  const from = zoneById(poi.anchorZoneId)!;
  const rng = seededRng(`bl2-spur-${poi.id}`);
  const dx = poi.x - from.center.x;
  const dz = poi.z - from.center.z;
  const length = Math.hypot(dx, dz);
  const steps = Math.max(4, Math.round(length / 12));
  const normalX = -dz / length;
  const normalZ = dx / length;
  const amplitude = 6 + rng() * 8;
  const phase = rng() * Math.PI;
  const points: RoutePoint[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const wobble = Math.sin(t * Math.PI * 2 + phase) * amplitude * Math.sin(t * Math.PI);
    points.push({
      x: from.center.x + dx * t + normalX * wobble,
      z: from.center.z + dz * t + normalZ * wobble,
      t,
    });
  }
  return { from: poi.anchorZoneId, to: poi.id, points };
}

export const SPUR_ROUTES: readonly Route[] = SIDE_POIS.map((poi) => buildSpur(poi));

export function roadFlattenMasks(
  heightAt: (x: number, z: number) => number,
): readonly { center: readonly [number, number]; radius: number; height: number; falloff: number }[] {
  const corridorMasks = (
    points: readonly RoutePoint[],
    fromCenter: { x: number; z: number },
    fromRadius: number,
    toCenter: { x: number; z: number },
    toRadius: number,
  ) => {
    const fromHeight = heightAt(fromCenter.x, fromCenter.z);
    const toHeight = heightAt(toCenter.x, toCenter.z);
    const length = Math.hypot(toCenter.x - fromCenter.x, toCenter.z - fromCenter.z);
    const rampStart = fromRadius;
    const rampSpan = Math.max(1, length - fromRadius - toRadius);
    return points
      .filter((point) => {
        const fromDistance = Math.hypot(point.x - fromCenter.x, point.z - fromCenter.z);
        const toDistance = Math.hypot(point.x - toCenter.x, point.z - toCenter.z);
        return fromDistance > fromRadius - 14 && toDistance > toRadius - 14;
      })
      .map((point) => {
        const rampT = Math.min(1, Math.max(0, (point.t * length - rampStart) / rampSpan));
        return {
          center: [point.x, point.z] as const,
          radius: 14,
          height: fromHeight + (toHeight - fromHeight) * rampT,
          falloff: 8,
        };
      });
  };

  const mainMasks = ROUTES.flatMap((route) => {
    const from = zoneById(route.from)!;
    const to = zoneById(route.to)!;
    return corridorMasks(route.points, from.center, from.flattenRadius, to.center, to.flattenRadius);
  });

  const spurMasks = SPUR_ROUTES.flatMap((route) => {
    const from = zoneById(route.from)!;
    const poi = SIDE_POIS.find((candidate) => candidate.id === route.to)!;
    return corridorMasks(route.points, from.center, from.flattenRadius, { x: poi.x, z: poi.z }, poi.radius);
  });

  const poiMasks = SIDE_POIS.map((poi) => {
    const anchor = zoneById(poi.anchorZoneId)!;
    return {
      center: [poi.x, poi.z] as const,
      radius: poi.radius,
      height: heightAt(anchor.center.x, anchor.center.z),
      falloff: 12,
    };
  });

  const wallMasks = [...ROUTES, ...SPUR_ROUTES].flatMap((route) => {
    const from = zoneById(route.from)!;
    const toZone = zoneById(route.to);
    const poi = SIDE_POIS.find((candidate) => candidate.id === route.to);
    const toCenter = toZone?.center ?? { x: poi!.x, z: poi!.z };
    const toRadius = toZone?.flattenRadius ?? poi!.radius;
    const fromHeight = heightAt(from.center.x, from.center.z);
    const toHeight = heightAt(toCenter.x, toCenter.z);
    const length = Math.hypot(toCenter.x - from.center.x, toCenter.z - from.center.z);
    const rampSpan = Math.max(1, length - from.flattenRadius - toRadius);
    const walls: { center: readonly [number, number]; radius: number; height: number; falloff: number }[] = [];
    for (let index = 0; index < route.points.length - 1; index += 2) {
      const point = route.points[index]!;
      const next = route.points[index + 1]!;
      const fromDistance = Math.hypot(point.x - from.center.x, point.z - from.center.z);
      const toDistance = Math.hypot(point.x - toCenter.x, point.z - toCenter.z);
      if (fromDistance < from.flattenRadius + 10 || toDistance < toRadius + 10) continue;
      const dx = next.x - point.x;
      const dz = next.z - point.z;
      const segment = Math.hypot(dx, dz) || 1;
      const rampT = Math.min(1, Math.max(0, (point.t * length - from.flattenRadius) / rampSpan));
      const roadHeight = fromHeight + (toHeight - fromHeight) * rampT;
      for (const side of [-1, 1]) {
        walls.push({
          center: [point.x + (-dz / segment) * 40 * side, point.z + (dx / segment) * 40 * side] as const,
          radius: 26,
          height: roadHeight + 22,
          falloff: 14,
        });
      }
    }
    return walls;
  });

  return [...wallMasks, ...poiMasks, ...mainMasks, ...spurMasks];
}

export interface PlacedPiece {
  catalogId: string;
  x: number;
  z: number;
  instanceId: string;
}

function ringPieces(
  catalogId: string,
  idPrefix: string,
  center: { x: number; z: number },
  radius: number,
  count: number,
  gapToward: RoutePoint | null,
): PlacedPiece[] {
  const pieces: PlacedPiece[] = [];
  const gapAngle = gapToward === null ? null : Math.atan2(gapToward.z - center.z, gapToward.x - center.x);
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    if (gapAngle !== null) {
      let delta = Math.abs(angle - ((gapAngle + Math.PI * 2) % (Math.PI * 2)));
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      if (delta < 0.55) continue;
    }
    pieces.push({
      catalogId,
      x: center.x + Math.cos(angle) * radius,
      z: center.z + Math.sin(angle) * radius,
      instanceId: `${idPrefix}_${index}`,
    });
  }
  return pieces;
}

function scatterPieces(
  catalogId: string,
  idPrefix: string,
  center: { x: number; z: number },
  radius: number,
  count: number,
  seed: string,
): PlacedPiece[] {
  const rng = seededRng(seed);
  const pieces: PlacedPiece[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = radius * (0.25 + rng() * 0.75);
    pieces.push({
      catalogId,
      x: center.x + Math.cos(angle) * distance,
      z: center.z + Math.sin(angle) * distance,
      instanceId: `${idPrefix}_${index}`,
    });
  }
  return pieces;
}

function routeToward(zoneId: string): RoutePoint | null {
  const route = ROUTES.find((candidate) => candidate.from === zoneId || candidate.to === zoneId);
  if (route === undefined) return null;
  return route.from === zoneId ? route.points[1]! : route.points[route.points.length - 2]!;
}

function offsetFrom(zone: ZoneDef, cluster: number): { x: number; z: number } {
  const entry = zone.clusters[cluster];
  if (entry === undefined) return zone.center;
  return { x: zone.center.x + entry.offset.x, z: zone.center.z + entry.offset.z };
}

export function zoneSetPieces(zone: ZoneDef): PlacedPiece[] {
  const pieces: PlacedPiece[] = [];
  const gate = routeToward(zone.id);

  switch (zone.id) {
    case "windshear_waste": {
      const spawn = { x: zone.center.x + 18, z: zone.center.z + 34 };
      pieces.push({ catalogId: "bus_wreck", x: zone.center.x + 10, z: zone.center.z + 46, instanceId: "crash_bus" });
      pieces.push(...scatterPieces("cover_crate", "rustflat_debris", { x: zone.center.x + 12, z: zone.center.z + 42 }, 10, 5, "bl2-crash-debris"));
      pieces.push({ catalogId: "wreck", x: spawn.x + 13, z: spawn.z + 6, instanceId: "rustflat_wreck_spawn" });
      pieces.push({ catalogId: "rock_spire", x: spawn.x - 14, z: spawn.z + 10, instanceId: "rustflat_spire_a" });
      pieces.push({ catalogId: "rock_spire", x: spawn.x + 18, z: spawn.z - 12, instanceId: "rustflat_spire_b" });
      pieces.push({ catalogId: "rock_spire", x: spawn.x - 8, z: spawn.z - 18, instanceId: "rustflat_spire_c" });
      pieces.push({ catalogId: "bone_arch", x: spawn.x + 6, z: spawn.z + 12, instanceId: "rustflat_bones_spawn" });
      pieces.push({ catalogId: "dead_tree", x: spawn.x - 10, z: spawn.z - 6, instanceId: "rustflat_tree_spawn" });
      pieces.push({ catalogId: "banner_pole", x: spawn.x + 10, z: spawn.z - 8, instanceId: "rustflat_banner_spawn" });
      pieces.push({ catalogId: "signpost", x: spawn.x - 5, z: spawn.z + 7, instanceId: "sign_rustflat_spawn" });
      pieces.push({ catalogId: "signpost", x: zone.center.x + 28, z: zone.center.z + 8, instanceId: "sign_rustflat" });
      pieces.push(...ringPieces("bone_arch", "rustflat_bones", offsetFrom(zone, 0), 22, 4, null));
      pieces.push(...scatterPieces("rock_spire", "rustflat_rocks", zone.center, zone.flattenRadius * 1.1, 6, "bl2-rustflat-rocks"));
      break;
    }
    case "southern_shelf": {
      const camp = offsetFrom(zone, 0);
      pieces.push(...ringPieces("barricade", "shelf_wall", camp, 26, 14, gate));
      pieces.push({ catalogId: "watchtower", x: camp.x + 18, z: camp.z - 18, instanceId: "shelf_tower_1" });
      pieces.push(...scatterPieces("tent", "shelf_tents", camp, 14, 4, "bl2-shelf-tents"));
      pieces.push(...scatterPieces("cover_crate", "shelf_cover", camp, 20, 7, "bl2-shelf-cover"));
      pieces.push(...ringPieces("banner_pole", "rusk_banners", { x: -60, z: 560 }, 16, 6, null));
      pieces.push(...ringPieces("cover_crate", "rusk_cover", { x: -60, z: 560 }, 11, 6, null));
      pieces.push({ catalogId: "signpost", x: zone.center.x + 40, z: zone.center.z - 30, instanceId: "sign_shelf" });
      break;
    }
    case "arid_badlands": {
      pieces.push({ catalogId: "water_tower", x: zone.center.x - 22, z: zone.center.z + 12, instanceId: "coretown_tower" });
      pieces.push(...scatterPieces("cover_crate", "coretown_crates", zone.center, 24, 6, "bl2-coretown-crates"));
      for (let index = 0; index < 4; index += 1) {
        pieces.push({
          catalogId: "street_lamp",
          x: zone.center.x - 18 + index * 12,
          z: zone.center.z - 14,
          instanceId: `coretown_lamp_${index}`,
        });
      }
      const camp = offsetFrom(zone, 3);
      pieces.push(...ringPieces("barricade", "badlands_wall", camp, 28, 16, gate));
      pieces.push({ catalogId: "watchtower", x: camp.x - 20, z: camp.z + 16, instanceId: "badlands_tower" });
      pieces.push(...scatterPieces("tent", "badlands_tents", camp, 16, 5, "bl2-badlands-tents"));
      const gully = offsetFrom(zone, 0);
      pieces.push(...ringPieces("bone_arch", "gully_bones", gully, 18, 5, null));
      pieces.push({ catalogId: "signpost", x: zone.center.x + 30, z: zone.center.z + 6, instanceId: "sign_coretown" });
      break;
    }
    case "three_horns": {
      const nest = offsetFrom(zone, 2);
      pieces.push(...ringPieces("bone_arch", "horns_bones", nest, 20, 6, null));
      const camp = offsetFrom(zone, 0);
      pieces.push(...ringPieces("barricade", "horns_wall", camp, 24, 12, gate));
      pieces.push(...scatterPieces("tent", "horns_tents", camp, 12, 3, "bl2-horns-tents"));
      pieces.push(...ringPieces("cover_crate", "badmaw_cover", { x: 500, z: 380 }, 12, 7, null));
      pieces.push({ catalogId: "watchtower", x: zone.center.x + 30, z: zone.center.z - 26, instanceId: "horns_tower" });
      pieces.push({ catalogId: "signpost", x: zone.center.x - 34, z: zone.center.z + 10, instanceId: "sign_horns" });
      break;
    }
    case "the_dust": {
      pieces.push(...scatterPieces("wreck", "dust_wrecks", zone.center, 40, 5, "bl2-dust-wrecks"));
      const camp = offsetFrom(zone, 2);
      pieces.push(...ringPieces("barricade", "dust_wall", camp, 26, 12, gate));
      pieces.push({ catalogId: "watchtower", x: camp.x + 16, z: camp.z + 18, instanceId: "dust_tower" });
      pieces.push(...scatterPieces("cover_crate", "dust_cover", camp, 18, 6, "bl2-dust-cover"));
      pieces.push({ catalogId: "signpost", x: zone.center.x - 30, z: zone.center.z + 34, instanceId: "sign_dust" });
      break;
    }
    case "eridium_blight": {
      pieces.push({ catalogId: "reactor_gate", x: -80, z: -640, instanceId: "reactor_gate" });
      pieces.push(...ringPieces("banner_pole", "blight_banners", { x: -80, z: -660 }, 22, 8, null));
      pieces.push(...ringPieces("cover_crate", "warrior_cover", { x: -80, z: -640 }, 15, 8, null));
      const line = offsetFrom(zone, 0);
      pieces.push(...ringPieces("barricade", "blight_wall", line, 24, 10, gate));
      pieces.push({ catalogId: "watchtower", x: line.x - 14, z: line.z - 16, instanceId: "blight_tower" });
      pieces.push({ catalogId: "signpost", x: zone.center.x + 26, z: zone.center.z + 40, instanceId: "sign_blight" });
      break;
    }
    default:
      break;
  }
  return pieces;
}

export function poiSetPieces(): PlacedPiece[] {
  const pieces: PlacedPiece[] = [];
  SIDE_POIS.forEach((poi, poiIndex) => {
    pieces.push({ catalogId: "red_chest", x: poi.x + 4, z: poi.z - 3, instanceId: `poi_chest_${poiIndex}` });
    pieces.push({ catalogId: "signpost", x: poi.x - poi.radius * 0.7, z: poi.z, instanceId: `poi_sign_${poiIndex}` });
    if (poi.dressing === "skag_den") {
      pieces.push(...ringPieces("bone_arch", `poi_bones_${poiIndex}`, poi, poi.radius * 0.6, 5, null));
    } else if (poi.dressing === "cache") {
      pieces.push(...scatterPieces("cover_crate", `poi_crates_${poiIndex}`, poi, poi.radius * 0.6, 6, `bl2-poi-${poi.id}`));
    } else {
      pieces.push(...scatterPieces("wreck", `poi_wrecks_${poiIndex}`, poi, poi.radius * 0.7, 5, `bl2-poi-${poi.id}`));
    }
  });
  return pieces;
}

export function roadsidePieces(): PlacedPiece[] {
  const pieces: PlacedPiece[] = [];
  [...ROUTES, ...SPUR_ROUTES].forEach((route, routeIndex) => {
    const rng = seededRng(`bl2-roadside-${routeIndex}`);
    for (let index = 2; index < route.points.length - 2; index += 3) {
      const point = route.points[index]!;
      const next = route.points[index + 1]!;
      const dx = next.x - point.x;
      const dz = next.z - point.z;
      const length = Math.hypot(dx, dz) || 1;
      const side = index % 2 === 0 ? 1 : -1;
      const kind = rng() < 0.6 ? "road_marker" : rng() < 0.5 ? "wreck" : "dead_tree";
      pieces.push({
        catalogId: kind,
        x: point.x + (-dz / length) * 11 * side,
        z: point.z + (dx / length) * 11 * side,
        instanceId: `roadside_${routeIndex}_${index}`,
      });
    }
  });
  return pieces;
}

export const NPC_PLACEMENTS: readonly { id: string; name: string; x: number; z: number }[] = (() => {
  const hub = zoneById("arid_badlands")!;
  return [
    { id: "npc_zed", name: "dr_sparx", x: hub.center.x + 12, z: hub.center.z - 10 },
    { id: "npc_rigg", name: "rigg", x: hub.center.x - 10, z: hub.center.z - 8 },
    { id: "npc_gauge", name: "gauge", x: hub.center.x + 2, z: hub.center.z + 20 },
  ];
})();

export function placeLevel(ctx: GameContext): void {
  const place = (piece: PlacedPiece) => {
    const y = ctx.world.groundHeightAt(piece.x, piece.z);
    ctx.scene.object.place(piece.catalogId, piece.x, y + 0.5, piece.z, { instanceId: piece.instanceId });
  };
  for (const zone of ZONES) for (const piece of zoneSetPieces(zone)) place(piece);
  for (const piece of poiSetPieces()) place(piece);
  for (const piece of roadsidePieces()) place(piece);
  for (const npc of NPC_PLACEMENTS) {
    ctx.scene.entity.spawn(npc.name, {
      id: npc.id,
      position: [npc.x, ctx.world.groundHeightAt(npc.x, npc.z), npc.z],
      role: "npc",
    });
  }
}

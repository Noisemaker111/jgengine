import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { ZONES, zoneById, type ZoneDef } from "./zones";

export interface RoutePoint {
  x: number;
  z: number;
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

function buildRoute(fromId: string, toId: string): Route {
  const from = zoneById(fromId)!;
  const to = zoneById(toId)!;
  const rng = seededRng(`bl2-road-${fromId}-${toId}`);
  const dx = to.center.x - from.center.x;
  const dz = to.center.z - from.center.z;
  const length = Math.hypot(dx, dz);
  const steps = Math.max(2, Math.round(length / 26));
  const normalX = -dz / length;
  const normalZ = dx / length;
  const points: RoutePoint[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const wobble = Math.sin(t * Math.PI * 2 + rng() * 2) * 18 * (rng() - 0.3);
    points.push({
      x: from.center.x + dx * t + normalX * wobble,
      z: from.center.z + dz * t + normalZ * wobble,
    });
  }
  return { from: fromId, to: toId, points };
}

export const ROUTES: readonly Route[] = ZONE_CHAIN.map(([from, to]) => buildRoute(from, to));

export const ROAD_FLATTEN_MASKS: readonly { center: readonly [number, number]; radius: number }[] =
  ROUTES.flatMap((route) => route.points.map((point) => ({ center: [point.x, point.z] as const, radius: 13 })));

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
      pieces.push({ catalogId: "bus_wreck", x: zone.center.x + 14, z: zone.center.z + 40, instanceId: "crash_bus" });
      pieces.push(...scatterPieces("cover_crate", "windshear_debris", { x: zone.center.x + 16, z: zone.center.z + 34 }, 14, 6, "bl2-crash-debris"));
      pieces.push({ catalogId: "signpost", x: zone.center.x + 28, z: zone.center.z + 8, instanceId: "sign_windshear" });
      pieces.push(...ringPieces("bone_arch", "windshear_bones", offsetFrom(zone, 0), 22, 4, null));
      break;
    }
    case "southern_shelf": {
      const camp = offsetFrom(zone, 0);
      pieces.push(...ringPieces("barricade", "shelf_wall", camp, 26, 14, gate));
      pieces.push({ catalogId: "watchtower", x: camp.x + 18, z: camp.z - 18, instanceId: "shelf_tower_1" });
      pieces.push(...scatterPieces("tent", "shelf_tents", camp, 14, 4, "bl2-shelf-tents"));
      pieces.push(...scatterPieces("cover_crate", "shelf_cover", camp, 20, 7, "bl2-shelf-cover"));
      pieces.push(...ringPieces("banner_pole", "flynt_banners", { x: -60, z: 560 }, 16, 6, null));
      pieces.push(...ringPieces("cover_crate", "flynt_cover", { x: -60, z: 560 }, 11, 6, null));
      pieces.push({ catalogId: "signpost", x: zone.center.x + 40, z: zone.center.z - 30, instanceId: "sign_shelf" });
      break;
    }
    case "arid_badlands": {
      pieces.push({ catalogId: "water_tower", x: zone.center.x - 22, z: zone.center.z + 12, instanceId: "fyrestone_tower" });
      pieces.push(...scatterPieces("cover_crate", "fyrestone_crates", zone.center, 24, 6, "bl2-fyrestone-crates"));
      for (let index = 0; index < 4; index += 1) {
        pieces.push({
          catalogId: "street_lamp",
          x: zone.center.x - 18 + index * 12,
          z: zone.center.z - 14,
          instanceId: `fyrestone_lamp_${index}`,
        });
      }
      const camp = offsetFrom(zone, 3);
      pieces.push(...ringPieces("barricade", "badlands_wall", camp, 28, 16, gate));
      pieces.push({ catalogId: "watchtower", x: camp.x - 20, z: camp.z + 16, instanceId: "badlands_tower" });
      pieces.push(...scatterPieces("tent", "badlands_tents", camp, 16, 5, "bl2-badlands-tents"));
      const gully = offsetFrom(zone, 0);
      pieces.push(...ringPieces("bone_arch", "gully_bones", gully, 18, 5, null));
      pieces.push({ catalogId: "signpost", x: zone.center.x + 30, z: zone.center.z + 6, instanceId: "sign_fyrestone" });
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
      pieces.push({ catalogId: "vault_gate", x: -80, z: -640, instanceId: "vault_gate" });
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

export function roadsidePieces(): PlacedPiece[] {
  const pieces: PlacedPiece[] = [];
  ROUTES.forEach((route, routeIndex) => {
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
    { id: "npc_zed", name: "dr_zed", x: hub.center.x + 12, z: hub.center.z - 10 },
    { id: "npc_marcus", name: "marcus", x: hub.center.x - 10, z: hub.center.z - 8 },
    { id: "npc_hammerlock", name: "hammerlock", x: hub.center.x + 2, z: hub.center.z + 20 },
  ];
})();

export function placeLevel(ctx: GameContext): void {
  const place = (piece: PlacedPiece) => {
    const y = ctx.world.groundHeightAt(piece.x, piece.z);
    ctx.scene.object.place(piece.catalogId, piece.x, y + 0.5, piece.z, { instanceId: piece.instanceId });
  };
  for (const zone of ZONES) for (const piece of zoneSetPieces(zone)) place(piece);
  for (const piece of roadsidePieces()) place(piece);
  for (const npc of NPC_PLACEMENTS) {
    ctx.scene.entity.spawn(npc.name, {
      id: npc.id,
      position: [npc.x, ctx.world.groundHeightAt(npc.x, npc.z), npc.z],
      role: "npc",
    });
  }
}

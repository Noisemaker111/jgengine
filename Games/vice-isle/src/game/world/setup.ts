import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import { patrol } from "@jgengine/core/scene/behaviors";
import type { Waypoint } from "@jgengine/core/nav/pathFollow";
import { deriveBuildingLots } from "@jgengine/core/world/buildingLots";
import { isOnRoad, nearestOnPath } from "@jgengine/core/world/roads";
import { furnitureSpots, parkingSpots, sidewalkPoint } from "@jgengine/core/world/streets";
import { streets } from "../../world";
import { buildingsByStyle, type BuildingStyle } from "./buildings";
import { PALM_IDS } from "./models";
import {
  BRIEFCASE_POS,
  AUTHORED_VEHICLE_SPAWNS,
  districtAt,
  DOCK_FIGHT_CENTER,
  GARAGE_POS,
  GUNSHOP_POS,
  MARCO_POS,
  PLAYER_SPAWN,
  PROMENADES,
  SAFEHOUSE_POS,
  SHORE_X,
  VCPD_POS,
  WORLD_D,
  WORLD_W,
} from "./districts";
import { vehicleById } from "../entities/vehicles/catalog";

function ground(ctx: GameContext, x: number, z: number): readonly [number, number, number] {
  return [x, ctx.world.groundHeightAt(x, z), z];
}

/**
 * Snap a ground-vehicle spawn to the nearest curbside parking pose so story cars sit on asphalt
 * (not lawn voids between lots). Aircraft keep their authored pad. (#1519)
 */
export function curbPoseNear(
  x: number,
  z: number,
  fallbackHeading: number,
): { x: number; z: number; heading: number } {
  let best: { dist: number; x: number; z: number; heading: number } | null = null;
  for (const street of streets) {
    for (const spot of parkingSpots(street, { spacing: 14, sides: "both" })) {
      const dist = Math.hypot(spot.position[0] - x, spot.position[1] - z);
      if (best === null || dist < best.dist) {
        best = { dist, x: spot.position[0], z: spot.position[1], heading: spot.heading };
      }
    }
  }
  if (best !== null && best.dist < 120) {
    return { x: best.x, z: best.z, heading: best.heading };
  }
  // Fallback: nearest centerline, nudged half a lane toward the curb.
  let line: { dist: number; x: number; z: number; heading: number } | null = null;
  for (const street of streets) {
    const sample = nearestOnPath(street.path, x, z);
    if (sample === null) continue;
    if (line === null || sample.distance < line.dist) {
      const [tx, tz] = sample.tangent;
      const nx = -tz;
      const nz = tx;
      const edge = street.width / 2 - 1.2;
      line = {
        dist: sample.distance,
        x: sample.point[0] + nx * edge,
        z: sample.point[1] + nz * edge,
        heading: Math.atan2(tx, tz),
      };
    }
  }
  return line !== null ? { x: line.x, z: line.z, heading: line.heading } : { x, z, heading: fallbackHeading };
}

const PED_KIND_BY_ROAD: readonly string[] = [
  "ped_beach",
  "ped_city",
  "ped_city",
  "ped_docks",
  "ped_city",
  "ped_city",
  "ped_city",
  "ped_docks",
  "ped_beach",
];

const STREET_BLOCKERS: readonly (readonly [number, number])[] = [
  [MARCO_POS[0], MARCO_POS[2]],
  [GUNSHOP_POS[0], GUNSHOP_POS[2]],
  [GARAGE_POS[0], GARAGE_POS[2]],
  [DOCK_FIGHT_CENTER[0], DOCK_FIGHT_CENTER[2]],
  [PLAYER_SPAWN[0], PLAYER_SPAWN[2]],
  [SAFEHOUSE_POS[0], SAFEHOUSE_POS[2]],
  [VCPD_POS[0], VCPD_POS[2]],
];

/** A rectangular city block bounded by two avenues (`x0`/`x1`) and two streets (`z0`/`z1`) from the grid. */
interface TrafficBlock {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Blocks whose four sides are authored avenues (x ∈ {−180,−60,60,180}) and streets (z ∈ {−240,−120,0,120,240}). */
const TRAFFIC_BLOCKS: readonly TrafficBlock[] = [
  { x0: -60, x1: 60, z0: -120, z1: 0 },
  { x0: -60, x1: 60, z0: 0, z1: 120 },
  { x0: 60, x1: 180, z0: -240, z1: -120 },
  { x0: -180, x1: -60, z0: 0, z1: 120 },
  { x0: 60, x1: 180, z0: 0, z1: 120 },
  { x0: -180, x1: -60, z0: -120, z1: 0 },
  { x0: -60, x1: 60, z0: 120, z1: 240 },
];

/** Lane inset (world units) pulling the loop off the street centerline into the block's inner lane. */
const TRAFFIC_LANE_INSET = 2.4;

/** Clockwise rectangle of corner waypoints for a block, inset so cars ride the inner (right-hand) lane. */
function blockLoopWaypoints(block: TrafficBlock): Waypoint[] {
  const ax0 = block.x0 + TRAFFIC_LANE_INSET;
  const ax1 = block.x1 - TRAFFIC_LANE_INSET;
  const az0 = block.z0 + TRAFFIC_LANE_INSET;
  const az1 = block.z1 - TRAFFIC_LANE_INSET;
  return [
    [ax0, 0, az0],
    [ax1, 0, az0],
    [ax1, 0, az1],
    [ax0, 0, az1],
  ];
}

function styleAt(x: number, z: number, rng: () => number): BuildingStyle {
  const district = districtAt(x, z);
  if (district?.id === "downtown") return rng() < 0.45 ? "tower" : "commercial";
  if (district?.id === "port_carmine") return "commercial";
  return "suburban";
}

/** Palms cycle by index rather than by roll, so a run of them never repeats the same silhouette. */
function palmAt(index: number): string {
  return PALM_IDS[index % PALM_IDS.length]!;
}

/**
 * The sidewalk prop that fits a location's district. Between districts the streets get palms and
 * planters rather than nothing — a bare kerb running out of the city was the biggest reason the
 * mid-distance read as empty plain.
 */
function districtProp(x: number, z: number, index: number, rng: () => number): string | null {
  const district = districtAt(x, z);
  switch (district?.id) {
    case "ocean_drive": {
      const roll = rng();
      return roll < 0.5 ? palmAt(index) : roll < 0.68 ? "obj_bench" : roll < 0.84 ? "obj_planter" : "obj_signal";
    }
    case "downtown": {
      const roll = rng();
      if (roll < 0.26) return "obj_neon";
      if (roll < 0.4) return "obj_signal";
      if (roll < 0.56) return palmAt(index);
      if (roll < 0.74) return "obj_hydrant";
      return roll < 0.88 ? "obj_trashcan" : "obj_planter";
    }
    case "port_carmine": {
      const roll = rng();
      return roll < 0.4 ? "obj_dumpster" : roll < 0.7 ? "obj_trashcan" : roll < 0.86 ? "obj_crate_dock" : palmAt(index);
    }
    case "palm_heights": {
      const roll = rng();
      return roll < 0.36 ? "obj_hedge" : roll < 0.58 ? "obj_cactus" : roll < 0.82 ? palmAt(index) : "obj_planter";
    }
    default:
      return rng() < 0.42 ? palmAt(index) : rng() < 0.5 ? "obj_planter" : null;
  }
}

/** Lot footprint fed to the frontage engine: `w` frontage (along the road), `d` depth (into the block). */
const BUILDING_FOOTPRINT = { w: 22, d: 16 };
/**
 * Extra margin (world units) added to a road's width when rejecting lots that straddle it. A lot whose
 * center falls within `(road.width + clearance) / 2` of ANY road centerline is dropped — the frontage
 * engine already sets each lot back from the road it lines, so this only culls the corner lots a
 * CROSSING street would run through. Without it, buildings spawn in the middle of the cross streets.
 */
const BUILDING_ROAD_CLEARANCE = 16;

/**
 * Ocean Drive is built on one side only. The frontage engine lines both kerbs of every avenue, which
 * put a row of blocks out on the sand between the boulevard and the water — so the seafront read as
 * another back street and the beach never opened up. Lots west of this line are dropped, leaving the
 * boardwalk, the dunes and the Gulf as the whole left half of the city's establishing view.
 */
const SEAFRONT_BUILD_LINE = SHORE_X + 24;

/**
 * Line every authored street with collidable, street-facing buildings using the engine's street-aware
 * frontage placer (`deriveBuildingLots` — the same lot engine `generateCity` composes over) instead of
 * hand-eyeballed furniture offsets. Lots set back past the curb and are dropped wherever they'd straddle
 * a crossing street or a gameplay POI, so no building ever lands on the asphalt. Each lot is placed as a
 * scene object, so it gets a fitted physical collider and blocks the player like a real building.
 */
function placeBuildings(ctx: GameContext, rng: () => number): void {
  const lots = deriveBuildingLots({
    roads: streets.map((street) => ({ path: street.path, width: street.width })),
    footprint: BUILDING_FOOTPRINT,
    spacing: 8,
    setback: 4,
    bothSides: true,
    seed: "vice-isle-lots",
    area: { center: [0, 0], halfExtents: [WORLD_W / 2, WORLD_D / 2] },
    maxLots: 320,
  });
  for (const lot of lots) {
    const [x, z] = lot.center;
    if (x < SEAFRONT_BUILD_LINE) continue;
    if (streets.some((street) => isOnRoad(street.path, street.width + BUILDING_ROAD_CLEARANCE, x, z))) continue;
    if (STREET_BLOCKERS.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 22)) continue;
    const options = buildingsByStyle(styleAt(x, z, rng));
    const pick = options[Math.floor(rng() * options.length)];
    if (pick === undefined) continue;
    ctx.scene.object.place(pick.id, Math.round(x), ctx.world.groundHeightAt(x, z), Math.round(z), {
      rotation: lot.rotationY,
    });
  }
}

/** World units between palms on an authored promenade; benches and planters land on alternate steps. */
const PROMENADE_SPACING = 18;

/**
 * Dress every `promenade` path from the scene document: a double row of palms with benches and
 * flowering planters between them. The walk's route, length and shape all come from the authored
 * polyline, so moving the boardwalk is dragging it in the editor.
 */
function dressPromenades(ctx: GameContext, rng: () => number): void {
  let step = 0;
  for (const walk of PROMENADES) {
    for (let segment = 0; segment + 1 < walk.points.length; segment += 1) {
      const [ax, az] = walk.points[segment]!;
      const [bx, bz] = walk.points[segment + 1]!;
      const dx = bx - ax;
      const dz = bz - az;
      const length = Math.hypot(dx, dz);
      if (length < 1) continue;
      const nx = -dz / length;
      const nz = dx / length;
      const steps = Math.max(1, Math.round(length / PROMENADE_SPACING));
      for (let i = 0; i < steps; i += 1) {
        const t = i / steps;
        const cx = ax + dx * t;
        const cz = az + dz * t;
        step += 1;
        for (const side of [-1, 1] as const) {
          const px = cx + nx * side * 4.5;
          const pz = cz + nz * side * 4.5;
          ctx.scene.object.place(
            PALM_IDS[(step + (side > 0 ? 1 : 0)) % PALM_IDS.length]!,
            Math.round(px),
            ctx.world.groundHeightAt(px, pz),
            Math.round(pz),
            { rotation: rng() * Math.PI * 2 },
          );
        }
        if (step % 3 === 0) {
          const bxp = cx + nx * 8.5;
          const bzp = cz + nz * 8.5;
          ctx.scene.object.place("obj_bench", Math.round(bxp), ctx.world.groundHeightAt(bxp, bzp), Math.round(bzp), {
            rotation: Math.atan2(nx, nz),
          });
        }
        if (step % 4 === 1) {
          const gx = cx - nx * 8.5;
          const gz = cz - nz * 8.5;
          ctx.scene.object.place("obj_planter", Math.round(gx), ctx.world.groundHeightAt(gx, gz), Math.round(gz));
        }
      }
    }
  }
}

export function setupWorld(ctx: GameContext): void {
  const rng = seededRng("vice-isle-setup");

  placeBuildings(ctx, rng);

  for (const spawn of AUTHORED_VEHICLE_SPAWNS) {
    const def = vehicleById(spawn.catalogId);
    const isAircraft = def?.dynamics.type === "aircraft";
    let x = spawn.position[0];
    let z = spawn.position[2];
    let rotationY = spawn.rotationY;
    if (!isAircraft) {
      const curb = curbPoseNear(x, z, rotationY);
      x = curb.x;
      z = curb.z;
      rotationY = curb.heading;
    }
    ctx.scene.entity.spawn(spawn.catalogId, {
      id: spawn.id,
      position: [x, ctx.world.groundHeightAt(x, z), z],
      rotationY,
      role: "prop",
    });
  }

  ctx.scene.entity.spawn("contact_marco", { id: "npc_marco", position: ground(ctx, MARCO_POS[0], MARCO_POS[2]), role: "npc" });

  let pedCount = 0;
  streets.forEach((street, roadIndex) => {
    const kind = PED_KIND_BY_ROAD[roadIndex] ?? "ped_city";
    for (let i = 0; i < 7; i += 1) {
      const side = rng() < 0.5 ? "left" : "right";
      const fraction = 0.15 + rng() * 0.7;
      const point = sidewalkPoint(street, side, fraction);
      if (point === null) continue;
      pedCount += 1;
      const id = `ped_${pedCount}`;
      const walk = sidewalkPoint(street, side, Math.min(1, fraction + 0.25));
      const behaviors =
        walk !== null
          ? [
              patrol({
                waypoints: [
                  [point[0], 0, point[1]],
                  [walk[0], 0, walk[1]],
                  [point[0], 0, point[1]],
                ] as Waypoint[],
                speed: 1.5,
                loop: true,
                groundClamp: true,
                startProgress: { kind: "distance", value: 1.5 * rng() * 40 },
              }),
            ]
          : [];
      ctx.scene.entity.spawn(kind, { id, position: ground(ctx, point[0], point[1]), role: "npc", behaviors });
    }
  });

  // Curbside metal on every avenue: a street-level frame needs parked cars in the near and mid
  // ground or the kerbs read as an unused film set. Kept to a fixed list so the count is bounded.
  const parkedKinds = [
    "car_compact", "car_muscle", "car_compact", "car_sport", "car_muscle", "car_compact", "car_muscle", "car_sport",
    "car_compact", "car_muscle", "car_compact", "car_suv", "car_muscle", "car_compact", "car_sport", "car_muscle",
    "car_compact", "car_sport", "car_suv", "car_muscle", "car_compact", "car_muscle", "car_sport", "car_compact",
    "car_muscle", "car_compact", "car_suv", "car_sport", "car_compact", "car_muscle", "car_compact", "car_sport",
  ];
  let parkedCount = 0;
  for (const street of streets) {
    if (parkedCount >= parkedKinds.length) break;
    const spots = parkingSpots(street, { spacing: 46, sides: "both" });
    for (const spot of spots) {
      if (parkedCount >= parkedKinds.length) break;
      if (rng() < 0.35) continue;
      const kind = parkedKinds[parkedCount]!;
      parkedCount += 1;
      ctx.scene.entity.spawn(kind, {
        id: `veh_${parkedCount}`,
        position: ground(ctx, spot.position[0], spot.position[1]),
        rotationY: spot.heading,
        role: "prop",
      });
    }
  }

  // Traffic circulates real city blocks: each car drives a rectangle whose four edges ride four
  // authored streets and turns at each intersection, so cars flow through the grid instead of looping
  // forward-and-back on a single segment (the old `[...forward, ...reverse]` path, which read as cars
  // driving tight circles). The rectangle is inset toward the block interior so cars keep to the
  // right-hand lane of each leg.
  TRAFFIC_BLOCKS.forEach((block, i) => {
    const waypoints = blockLoopWaypoints(block);
    const start = waypoints[0]!;
    for (let lap = 0; lap < 3; lap += 1) {
      const id = `traffic_${i}_${lap}`;
      const kind = (i + lap) % 3 === 2 ? "car_muscle" : (i + lap) % 3 === 1 ? "car_sport" : "car_compact";
      ctx.scene.entity.spawn(kind, {
        id,
        position: ground(ctx, start[0], start[2]),
        role: "prop",
        behaviors: [
          patrol({
            waypoints,
            speed: 8,
            loop: true,
            groundClamp: true,
            startProgress: { kind: "distance", value: 8 * (rng() * 60 + lap * 90) },
          }),
        ],
      });
    }
  });

  const gangSpots: readonly (readonly [number, number])[] = [
    [DOCK_FIGHT_CENTER[0] - 12, DOCK_FIGHT_CENTER[2] - 8],
    [DOCK_FIGHT_CENTER[0] + 10, DOCK_FIGHT_CENTER[2] - 14],
    [DOCK_FIGHT_CENTER[0] - 4, DOCK_FIGHT_CENTER[2] + 12],
    [DOCK_FIGHT_CENTER[0] + 16, DOCK_FIGHT_CENTER[2] + 6],
    [DOCK_FIGHT_CENTER[0] + 2, DOCK_FIGHT_CENTER[2] - 24],
  ];
  gangSpots.forEach(([x, z], i) => {
    ctx.scene.entity.spawn("ganger_dock", { id: `ganger_${i}`, position: ground(ctx, x, z), role: "npc" });
  });
  ctx.scene.entity.spawn("ganger_enforcer", {
    id: "enforcer_boss",
    position: ground(ctx, BRIEFCASE_POS[0], BRIEFCASE_POS[2] - 6),
    role: "npc",
  });

  ctx.scene.object.place("obj_gunshop_sign", GUNSHOP_POS[0], ctx.world.groundHeightAt(GUNSHOP_POS[0], GUNSHOP_POS[2]), GUNSHOP_POS[2]);
  ctx.scene.object.place(
    "obj_safehouse_sign",
    SAFEHOUSE_POS[0],
    ctx.world.groundHeightAt(SAFEHOUSE_POS[0], SAFEHOUSE_POS[2]),
    SAFEHOUSE_POS[2],
  );
  ctx.scene.object.place("obj_vcpd_sign", VCPD_POS[0], ctx.world.groundHeightAt(VCPD_POS[0], VCPD_POS[2]), VCPD_POS[2]);
  for (let i = 0; i < 8; i += 1) {
    const x = DOCK_FIGHT_CENTER[0] - 20 + rng() * 40;
    const z = DOCK_FIGHT_CENTER[2] - 20 + rng() * 40;
    ctx.scene.object.place("obj_crate_dock", Math.round(x), Math.round(ctx.world.groundHeightAt(x, z)), Math.round(z));
  }

  let propIndex = 0;
  streets.forEach((street) => {
    // Denser lighting the length of every street reads as a lived-in city at night.
    for (const spot of furnitureSpots(street, { spacing: 50, outset: 1.1 })) {
      ctx.scene.object.place(
        "obj_streetlight",
        spot.position[0],
        ctx.world.groundHeightAt(spot.position[0], spot.position[1]),
        spot.position[1],
        { rotation: spot.heading },
      );
    }
    // District-flavored sidewalk dressing: neon + hydrants downtown, palms + benches on Ocean Drive,
    // dock clutter in Port Carmine, hedges + cacti up in Palm Heights. Placed on the curb-side sidewalk
    // spots the furniture engine returns, so nothing lands on the asphalt, and gameplay POIs are kept
    // clear so signage/contacts stay readable.
    for (const spot of furnitureSpots(street, { spacing: 26, outset: 3.4 })) {
      const [x, z] = spot.position;
      if (STREET_BLOCKERS.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 12)) continue;
      propIndex += 1;
      const prop = districtProp(x, z, propIndex, rng);
      if (prop === null) continue;
      const isTree = prop.startsWith("obj_palm") || prop === "obj_hedge" || prop === "obj_cactus" || prop === "obj_planter";
      ctx.scene.object.place(prop, Math.round(x), ctx.world.groundHeightAt(x, z), Math.round(z), {
        rotation: isTree ? rng() * Math.PI * 2 : spot.heading,
      });
    }
  });

  dressPromenades(ctx, rng);

  // Port Carmine reads as a working waterfront: stacked cargo around the dock beyond the loose crates.
  const cargoSpots: readonly (readonly [number, number, number])[] = [
    [DOCK_FIGHT_CENTER[0] + 24, 0, DOCK_FIGHT_CENTER[2] - 10],
    [DOCK_FIGHT_CENTER[0] + 24, 0, DOCK_FIGHT_CENTER[2] + 4],
    [DOCK_FIGHT_CENTER[0] - 26, 0, DOCK_FIGHT_CENTER[2] + 12],
    [DOCK_FIGHT_CENTER[0] + 40, 0, DOCK_FIGHT_CENTER[2] - 2],
    [DOCK_FIGHT_CENTER[0] + 6, 0, DOCK_FIGHT_CENTER[2] + 28],
  ];
  cargoSpots.forEach(([x, , z], i) => {
    ctx.scene.object.place("obj_cargo", Math.round(x), ctx.world.groundHeightAt(x, z), Math.round(z), {
      rotation: i % 2 === 0 ? 0 : Math.PI / 2,
    });
  });

  ctx.scene.worldItem.spawn({
    itemId: "briefcase_carmine",
    position: [BRIEFCASE_POS[0], ctx.world.groundHeightAt(BRIEFCASE_POS[0], BRIEFCASE_POS[2]) + 0.4, BRIEFCASE_POS[2]],
    rarity: "legendary",
  });
}

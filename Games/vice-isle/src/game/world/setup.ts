import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import { patrol } from "@jgengine/core/scene/behaviors";
import type { Waypoint } from "@jgengine/core/nav/pathFollow";
import { deriveBuildingLots } from "@jgengine/core/world/buildingLots";
import { isOnRoad } from "@jgengine/core/world/roads";
import { furnitureSpots, parkingSpots, sidewalkPoint } from "@jgengine/core/world/streets";
import { streets } from "../../world";
import { buildingsByStyle, type BuildingStyle } from "./buildings";
import {
  BRIEFCASE_POS,
  AUTHORED_VEHICLE_SPAWNS,
  districtAt,
  DOCK_FIGHT_CENTER,
  GUNSHOP_POS,
  MARCO_POS,
  SAFEHOUSE_POS,
  VCPD_POS,
  WORLD_D,
  WORLD_W,
} from "./districts";

function ground(ctx: GameContext, x: number, z: number): readonly [number, number, number] {
  return [x, ctx.world.groundHeightAt(x, z), z];
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
  [-68, 116],
  [DOCK_FIGHT_CENTER[0], DOCK_FIGHT_CENTER[2]],
  [-176, 24],
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

export function setupWorld(ctx: GameContext): void {
  const rng = seededRng("vice-isle-setup");

  placeBuildings(ctx, rng);

  for (const spawn of AUTHORED_VEHICLE_SPAWNS) {
    const x = spawn.position[0];
    const z = spawn.position[2];
    ctx.scene.entity.spawn(spawn.catalogId, {
      id: spawn.id,
      position: [x, ctx.world.groundHeightAt(x, z), z],
      rotationY: spawn.rotationY,
      role: "prop",
    });
  }

  ctx.scene.entity.spawn("contact_marco", { id: "npc_marco", position: ground(ctx, MARCO_POS[0], MARCO_POS[2]), role: "npc" });

  let pedCount = 0;
  streets.forEach((street, roadIndex) => {
    const kind = PED_KIND_BY_ROAD[roadIndex] ?? "ped_city";
    for (let i = 0; i < 2; i += 1) {
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

  const parkedKinds = ["car_compact", "car_muscle", "car_compact", "car_sport", "car_muscle", "car_compact", "car_muscle", "car_sport"];
  let parkedCount = 0;
  for (const street of streets) {
    if (parkedCount >= parkedKinds.length) break;
    const spots = parkingSpots(street, { spacing: 120, sides: "right" });
    for (const spot of spots) {
      if (parkedCount >= parkedKinds.length) break;
      if (rng() < 0.45) continue;
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
    for (let lap = 0; lap < 2; lap += 1) {
      const id = `traffic_${i}_${lap}`;
      const kind = (i + lap) % 3 === 2 ? "car_muscle" : "car_compact";
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

  streets.forEach((street, roadIndex) => {
    for (const spot of furnitureSpots(street, { spacing: 72, outset: 0.9 })) {
      ctx.scene.object.place(
        "obj_streetlight",
        spot.position[0],
        ctx.world.groundHeightAt(spot.position[0], spot.position[1]),
        spot.position[1],
        { rotation: spot.heading },
      );
    }
    if (roadIndex === 0) {
      for (const spot of furnitureSpots(street, { spacing: 40, sides: "left", outset: 3.4 })) {
        ctx.scene.object.place(
          "obj_palm_planter",
          spot.position[0],
          ctx.world.groundHeightAt(spot.position[0], spot.position[1]),
          spot.position[1],
        );
      }
    }
  });

  ctx.scene.worldItem.spawn({
    itemId: "briefcase_carmine",
    position: [BRIEFCASE_POS[0], ctx.world.groundHeightAt(BRIEFCASE_POS[0], BRIEFCASE_POS[2]) + 0.4, BRIEFCASE_POS[2]],
    rarity: "legendary",
  });
}

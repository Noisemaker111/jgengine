import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import { patrol } from "@jgengine/core/scene/behaviors";
import type { Waypoint } from "@jgengine/core/nav/pathFollow";
import { furnitureSpots, laneCenters, parkingSpots, sidewalkPoint } from "@jgengine/core/world/streets";
import { streets } from "../../world";
import { buildingsByStyle, type BuildingStyle } from "./buildings";
import {
  BRIEFCASE_POS,
  districtAt,
  DOCK_FIGHT_CENTER,
  GUNSHOP_POS,
  MARCO_POS,
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
];

function styleAt(x: number, z: number, rng: () => number): BuildingStyle {
  const district = districtAt(x, z);
  if (district?.id === "downtown") return rng() < 0.45 ? "tower" : "commercial";
  if (district?.id === "port_carmine") return "commercial";
  return "suburban";
}

function placeBuildings(ctx: GameContext, rng: () => number): void {
  for (const street of streets) {
    const vertical = street.path[0]![0] === street.path[1]![0];
    if (!vertical) continue;
    for (const spot of furnitureSpots(street, { spacing: 27, outset: 11, sides: "both", stagger: false })) {
      const [x, z] = spot.position;
      if (STREET_BLOCKERS.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 22)) continue;
      const options = buildingsByStyle(styleAt(x, z, rng));
      const pick = options[Math.floor(rng() * options.length)];
      if (pick === undefined) continue;
      ctx.scene.object.place(pick.id, Math.round(x), ctx.world.groundHeightAt(x, z), Math.round(z), {
        rotation: spot.heading + Math.PI,
      });
    }
  }
}

export function setupWorld(ctx: GameContext): void {
  const rng = seededRng("vice-isle-setup");

  placeBuildings(ctx, rng);

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

  const trafficRoads = [1, 2, 5, 6, 7];
  trafficRoads.forEach((roadIndex, i) => {
    const street = streets[roadIndex];
    if (street === undefined) return;
    const [forward, reverse] = laneCenters(street);
    const loop = [...forward.path, ...reverse.path];
    for (let lap = 0; lap < 2; lap += 1) {
      const id = `traffic_${i}_${lap}`;
      const kind = (i + lap) % 3 === 2 ? "car_muscle" : "car_compact";
      const start = loop[0]!;
      ctx.scene.entity.spawn(kind, {
        id,
        position: ground(ctx, start[0], start[1]),
        role: "prop",
        behaviors: [
          patrol({
            waypoints: loop.map(([x, z]) => [x, 0, z] as const),
            speed: 8,
            loop: true,
            groundClamp: true,
            startProgress: { kind: "distance", value: 8 * (rng() * 200 + lap * 90) },
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

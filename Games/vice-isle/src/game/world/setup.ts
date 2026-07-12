import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import { handroll } from "../handroll";
import {
  BRIEFCASE_POS,
  DOCK_FIGHT_CENTER,
  GARAGE_POS,
  GUNSHOP_POS,
  MARCO_POS,
  PALM_SPOTS,
  roadPoints,
} from "./districts";

function ground(ctx: GameContext, x: number, z: number): readonly [number, number, number] {
  return [x, ctx.world.groundHeightAt(x, z), z];
}

const PARKED_CARS: readonly { kind: string; x: number; z: number; heading: number }[] = [
  { kind: "car_compact", x: -172, z: 30, heading: 0 },
  { kind: "car_compact", x: -64, z: -18, heading: Math.PI / 2 },
  { kind: "car_muscle", x: -170, z: -8, heading: Math.PI },
  { kind: "car_muscle", x: 66, z: -66, heading: 0 },
  { kind: "car_sport", x: -64, z: 112, heading: Math.PI / 2 },
  { kind: "car_compact", x: 176, z: 116, heading: Math.PI },
  { kind: "car_muscle", x: 124, z: 184, heading: 0 },
  { kind: "car_sport", x: 74, z: -236, heading: Math.PI / 2 },
];

const PED_SPOTS: readonly { kind: string; x: number; z: number }[] = [
  { kind: "ped_beach", x: -182, z: 44 },
  { kind: "ped_beach", x: -168, z: -36 },
  { kind: "ped_beach", x: -188, z: 90 },
  { kind: "ped_city", x: 34, z: -48 },
  { kind: "ped_city", x: 52, z: -80 },
  { kind: "ped_city", x: 18, z: -30 },
  { kind: "ped_city", x: -50, z: 14 },
  { kind: "ped_docks", x: 116, z: 176 },
  { kind: "ped_docks", x: 150, z: 202 },
  { kind: "ped_city", x: 66, z: -228 },
  { kind: "ped_beach", x: -160, z: 120 },
  { kind: "ped_beach", x: -186, z: 160 },
  { kind: "ped_city", x: 62, z: -104 },
  { kind: "ped_city", x: 28, z: -84 },
  { kind: "ped_city", x: -46, z: -30 },
  { kind: "ped_docks", x: 104, z: 214 },
  { kind: "ped_docks", x: 138, z: 168 },
  { kind: "ped_city", x: 84, z: -252 },
];

export function setupWorld(ctx: GameContext): void {
  const rng = seededRng("vice-isle-setup");

  ctx.scene.entity.spawn("contact_marco", { id: "npc_marco", position: ground(ctx, MARCO_POS[0], MARCO_POS[2]), role: "npc" });

  PED_SPOTS.forEach((spot, i) => {
    ctx.scene.entity.spawn(spot.kind, { id: `ped_${i}`, position: ground(ctx, spot.x, spot.z), role: "npc" });
  });

  PARKED_CARS.forEach((car, i) => {
    ctx.scene.entity.spawn(car.kind, {
      id: `veh_${i}`,
      position: ground(ctx, car.x, car.z),
      rotationY: car.heading,
      role: "prop",
    });
  });

  for (let i = 0; i < 9; i += 1) {
    const id = `traffic_${i}`;
    ctx.scene.entity.spawn(i % 3 === 2 ? "car_muscle" : "car_compact", { id, position: ground(ctx, -60, 0), role: "prop" });
    handroll.registerTrafficCar(id, i % 3, rng() * 140);
  }

  for (const [x, z] of PALM_SPOTS) {
    ctx.scene.object.place("obj_palm_planter", Math.round(x), Math.round(ctx.world.groundHeightAt(x, z) + 0.5), Math.round(z));
  }

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

  ctx.scene.object.place("obj_gunshop_sign", GUNSHOP_POS[0], ctx.world.groundHeightAt(GUNSHOP_POS[0], GUNSHOP_POS[2]) + 2, GUNSHOP_POS[2]);
  for (let i = 0; i < 8; i += 1) {
    const x = DOCK_FIGHT_CENTER[0] - 20 + rng() * 40;
    const z = DOCK_FIGHT_CENTER[2] - 20 + rng() * 40;
    ctx.scene.object.place("obj_crate_dock", Math.round(x), Math.round(ctx.world.groundHeightAt(x, z) + 0.5), Math.round(z));
  }
  for (const [x, z] of roadPoints(60)) {
    if (Math.abs(x) > 190 || Math.abs(z) > 250) continue;
    ctx.scene.object.place("obj_streetlight", Math.round(x + 4), Math.round(ctx.world.groundHeightAt(x, z) + 2), Math.round(z + 4));
  }

  ctx.scene.worldItem.spawn({
    itemId: "briefcase_carmine",
    position: [BRIEFCASE_POS[0], ctx.world.groundHeightAt(BRIEFCASE_POS[0], BRIEFCASE_POS[2]) + 0.4, BRIEFCASE_POS[2]],
    rarity: "legendary",
  });

  void GARAGE_POS;
}

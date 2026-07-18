import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { safehouseStore } from "./commands";
import { vehicleById } from "./entities/vehicles/catalog";
import { handrollOf } from "./handroll";
import { GARAGE_POS, GUNSHOP_POS, MARCO_POS, RACE_ROUTES, SAFEHOUSE_POS } from "./world/districts";

const staticPrompts: readonly PositionedPrompt[] = [
  {
    id: "shop:ammunation",
    position: { x: GUNSHOP_POS[0], z: GUNSHOP_POS[2] },
    prompt: {
      radius: 4,
      display: { kind: "keybind", actionId: "interact" },
      invoke: { name: "shop.open", input: undefined },
    },
  },
  {
    id: "talk:marco",
    position: { x: MARCO_POS[0], z: MARCO_POS[2] },
    prompt: {
      radius: 4,
      display: { kind: "keybind", actionId: "interact" },
      invoke: { name: "dialogue.open", input: { id: "dlg_marco" } },
    },
  },
];

const garagePrompt: PositionedPrompt = {
  id: "garage:dealer",
  position: { x: GARAGE_POS[0], z: GARAGE_POS[2] },
  prompt: {
    radius: 5,
    display: { kind: "keybind", actionId: "interact" },
    invoke: { name: "garage.open", input: undefined },
  },
};

// One start-line prompt per authored race route, anchored at the route's start (last checkpoint).
const racePrompts: readonly PositionedPrompt[] = RACE_ROUTES.flatMap((route) => {
  const start = route.checkpoints[route.checkpoints.length - 1];
  if (start === undefined) return [];
  return [{
    id: `race:${route.id}`,
    position: { x: start[0], z: start[1] },
    prompt: {
      radius: 9,
      display: { kind: "keybind", actionId: "interact" },
      invoke: { name: "race.start", input: undefined },
    },
  }];
});

function safehousePrompt(ctx: GameContext): PositionedPrompt {
  const owned = safehouseStore.read(ctx) === true;
  return {
    id: owned ? "safehouse:rest" : "safehouse:buy",
    position: { x: SAFEHOUSE_POS[0], z: SAFEHOUSE_POS[2] },
    prompt: {
      radius: 4,
      display: { kind: "keybind", actionId: "interact" },
      invoke: { name: owned ? "safehouse.rest" : "safehouse.buy", input: undefined },
    },
  };
}

export function prompts(ctx: GameContext): readonly PositionedPrompt[] {
  if (handrollOf(ctx).drivingVehicleId() !== null) {
    if (handrollOf(ctx).raceActive()) return [];
    return racePrompts;
  }
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return staticPrompts;
  let nearestCar: { id: string; x: number; z: number } | null = null;
  let nearestDist = 6;
  for (const entity of ctx.scene.entity.list()) {
    if (vehicleById(entity.name) === undefined) continue;
    const dist = Math.hypot(entity.position[0] - player.position[0], entity.position[2] - player.position[2]);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestCar = { id: entity.id, x: entity.position[0], z: entity.position[2] };
    }
  }
  if (nearestCar === null) return [...staticPrompts, garagePrompt, safehousePrompt(ctx)];
  return [
    ...staticPrompts,
    garagePrompt,
    safehousePrompt(ctx),
    {
      id: `enter:${nearestCar.id}`,
      position: { x: nearestCar.x, z: nearestCar.z },
      priority: 1,
      prompt: {
        radius: 4,
        display: { kind: "keybind", actionId: "interact" },
        invoke: { name: "vehicle.enter", input: { vehicle: nearestCar.id } },
      },
    },
  ];
}

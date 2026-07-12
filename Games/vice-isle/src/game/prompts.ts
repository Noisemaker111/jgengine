import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { vehicleById } from "./entities/vehicles/catalog";
import { handroll } from "./handroll";
import { GUNSHOP_POS, MARCO_POS } from "./world/districts";

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
      invoke: { name: "contact.talk", input: { dialogue: "dlg_marco" } },
    },
  },
];

export function prompts(ctx: GameContext): readonly PositionedPrompt[] {
  if (handroll.drivingVehicleId() !== null) return [];
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
  if (nearestCar === null) return staticPrompts;
  return [
    ...staticPrompts,
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

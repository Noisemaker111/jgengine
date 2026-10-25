import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { safehouseStore, SHOP_CLOSES, SHOP_OPENS } from "./commands";
import { vehicleById } from "./entities/vehicles/catalog";
import { handrollOf } from "./handroll";
import { courierPrompts } from "./jobs/courier";
import { gigPromptLabel, gigPrompts } from "./jobs/gigs";
import { cityOf } from "./cityRuntime";
import { frontPromptLabel, frontPrompts } from "./city/fronts";
import { garagePrompts, garagePromptLabel } from "./city/garage";
import { streetPromptLabel, streetPrompts } from "./city/street";
import { GARAGE_POS, GUNSHOP_POS, RACE_ROUTES, SAFEHOUSE_POS } from "./world/districts";

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
];

/**
 * One talk prompt per person the city knows a place for, and one start prompt per open job that has
 * no giver: a person or job added to `city.ts` is reachable here without a line of prompt code.
 */
function cityPrompts(ctx: GameContext): PositionedPrompt[] {
  const world = cityOf(ctx);
  const out: PositionedPrompt[] = [];
  for (const id of Object.keys(world.def.people ?? {})) {
    const at = world.position(id);
    if (at === null || world.fact(`${id}.known`) !== true) continue;
    out.push({
      id: `talk:${id}`,
      position: { x: at[0], z: at[1] },
      prompt: { radius: 4, display: { kind: "keybind", actionId: "interact" }, invoke: { name: "dialogue.open", input: { id: `person:${id}` } } },
    });
  }
  for (const job of world.jobs()) {
    if (job.giver !== null || job.position === null || (job.status !== "available" && job.status !== "failed")) continue;
    out.push({
      id: `job:${job.id}`,
      position: { x: job.position[0], z: job.position[1] },
      priority: 2,
      prompt: { radius: 6, display: { kind: "keybind", actionId: "interact" }, invoke: { name: "city.job.start", input: { id: job.id } } },
    });
  }
  return out;
}

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
    return [...streetPrompts(ctx), ...garagePrompts(ctx), ...courierPrompts(ctx), ...gigPrompts(ctx), ...racePrompts];
  }
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return staticPrompts;
  const nearbyPrompts = [...staticPrompts, ...gigPrompts(ctx), ...cityPrompts(ctx), ...frontPrompts(ctx, player.position), ...garagePrompts(ctx)];
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
  if (nearestCar === null) return [...courierPrompts(ctx), ...nearbyPrompts, garagePrompt, safehousePrompt(ctx)];
  return [
    ...courierPrompts(ctx),
    ...nearbyPrompts,
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

/** Label for a prompt this module's systems own, or null for the HUD's own table. */
export function systemPromptLabel(ctx: GameContext, id: string): string | null {
  if (id === "shop:ammunation") {
    const hour = ctx.time.calendar().hour;
    return hour >= SHOP_OPENS && hour < SHOP_CLOSES ? null : `Ammu-Isle · shut until ${SHOP_OPENS}:00`;
  }
  return gigPromptLabel(id) ?? frontPromptLabel(ctx, id) ?? streetPromptLabel(ctx, id) ?? garagePromptLabel(ctx, id);
}

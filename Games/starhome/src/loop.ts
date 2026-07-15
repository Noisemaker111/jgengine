import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { registerCommands } from "./game/commands";
import { registerLifeEvents } from "./game/sim/events";
import { setupWorld } from "./game/sim/setup";
import { simulateHousehold } from "./game/sim/simulate";

export function onInit(ctx: GameContext): void {
  registerCommands(ctx);
  setupWorld(ctx);
  registerLifeEvents(ctx);
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(ctx: GameContext, dt: number): void {
  simulateHousehold(ctx, dt);
}

export const loop = { onInit, onNewPlayer, onTick };

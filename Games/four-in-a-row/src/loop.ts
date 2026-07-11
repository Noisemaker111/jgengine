import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { initApp, registerCommands, stepAi } from "./game/commands";

export function onInit(ctx: GameContext): void {
  registerCommands(ctx);
  initApp(ctx);
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(ctx: GameContext, dt: number): void {
  stepAi(ctx, dt);
}

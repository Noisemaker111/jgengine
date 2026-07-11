import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { initApp, registerCommands } from "./game/commands";

export function onInit(ctx: GameContext): void {
  registerCommands(ctx);
  initApp(ctx);
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(_ctx: GameContext, _dt: number): void {}

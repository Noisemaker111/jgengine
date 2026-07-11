import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { initApp, registerCommands } from "./game/commands";
import { STORE_KEY, type AppState } from "./game/state";

export function onInit(ctx: GameContext): void {
  registerCommands(ctx);
  initApp(ctx);
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(ctx: GameContext, dt: number): void {
  const app = ctx.game.store.get(STORE_KEY) as AppState | undefined;
  if (app === undefined || app.board.status !== "playing") return;
  const board = app.board;
  const prevSecond = Math.floor(board.elapsedMs / 1000);
  board.elapsedMs = Math.min(board.elapsedMs + dt * 1000, 999_000);
  if (Math.floor(board.elapsedMs / 1000) !== prevSecond) {
    // Re-publish so the timer HUD re-renders; the cells array keeps its identity
    // (memoized tiles skip the churn), only the second counter advances.
    ctx.game.store.set(STORE_KEY, { ...app, board: { ...board } });
  }
}

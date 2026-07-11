import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { initApp, registerCommands } from "./game/commands";
import { STORE_KEY, type AppState } from "./game/state";

const MAX_ELAPSED_MS = 5_999_000; // 99:59 cap

export function onInit(ctx: GameContext): void {
  registerCommands(ctx);
  initApp(ctx);
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(ctx: GameContext, dt: number): void {
  const app = ctx.game.store.get(STORE_KEY) as AppState | undefined;
  if (app === undefined || app.board.status !== "playing" || !app.board.started) return;
  const board = app.board;
  const prevSecond = Math.floor(board.elapsedMs / 1000);
  board.elapsedMs = Math.min(board.elapsedMs + dt * 1000, MAX_ELAPSED_MS);
  if (Math.floor(board.elapsedMs / 1000) !== prevSecond) {
    // Re-publish only when the whole-second changes; the cells array keeps its
    // identity so memoized tiles skip the churn.
    ctx.game.store.set(STORE_KEY, { ...app, board: { ...board } });
  }
}

import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { AiLevel } from "./ai";
import { freshGame, humanMove, undoMove } from "./engine";
import { readRecords, resetRecords } from "./records";
import { STORE_KEY } from "./state";
import type { AppState, Mode } from "./state";

function getApp(ctx: GameContext): AppState | undefined {
  return ctx.game.store.get(STORE_KEY) as AppState | undefined;
}

function setApp(ctx: GameContext, app: AppState): void {
  ctx.game.store.set(STORE_KEY, app);
}

export function initApp(ctx: GameContext): void {
  setApp(ctx, freshGame("ai", "club"));
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define<{ index?: number }>("place", {
    apply: (_state, input) => {
      const app = getApp(ctx);
      if (app === undefined || typeof input.index !== "number") return;
      const next = humanMove(app, input.index);
      if (next !== null) setApp(ctx, next);
    },
  });

  ctx.game.commands.define<{ mode?: Mode; level?: AiLevel }>("startGame", {
    apply: (_state, input) => {
      const app = getApp(ctx);
      const mode: Mode = input.mode ?? app?.mode ?? "ai";
      const level: AiLevel = input.level ?? app?.level ?? "club";
      setApp(ctx, freshGame(mode, level));
    },
  });

  ctx.game.commands.define<Record<string, never>>("rematch", {
    apply: () => {
      const app = getApp(ctx);
      if (app !== undefined) setApp(ctx, freshGame(app.mode, app.level));
    },
  });

  ctx.game.commands.define<Record<string, never>>("undo", {
    apply: () => {
      const app = getApp(ctx);
      if (app !== undefined) setApp(ctx, undoMove(app));
    },
  });

  ctx.game.commands.define<Record<string, never>>("resetRecords", {
    apply: () => {
      resetRecords();
      const app = getApp(ctx);
      if (app !== undefined) setApp(ctx, { ...app, records: readRecords() });
    },
  });
}

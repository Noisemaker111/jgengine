import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { initApp, registerCommands } from "./game/commands";
import { AI_DELAY_MS, aiMove } from "./game/engine";
import { STORE_KEY } from "./game/state";
import type { AppState } from "./game/state";

export function onInit(ctx: GameContext): void {
  registerCommands(ctx);
  initApp(ctx);
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(ctx: GameContext, dt: number): void {
  const app = ctx.game.store.get(STORE_KEY) as AppState | undefined;
  if (app === undefined) return;
  const ms = dt * 1000;
  let next = app;
  let changed = false;

  if (next.passBanner !== null) {
    const remaining = next.passBannerMs - ms;
    next = remaining <= 0 ? { ...next, passBanner: null, passBannerMs: 0 } : { ...next, passBannerMs: remaining };
    changed = true;
  }

  if (next.status === "playing" && next.aiThinking) {
    const timer = next.aiTimerMs + ms;
    next = timer >= AI_DELAY_MS ? aiMove({ ...next, aiThinking: false, aiTimerMs: 0 }) : { ...next, aiTimerMs: timer };
    changed = true;
  }

  if (changed) ctx.game.store.set(STORE_KEY, next);
}

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

/** Which full-screen survivor panel is open: ARK's inventory (with crafting and stats) or the engram list. */
export type Screen = "inventory" | "engrams";

const open = perContext((_ctx: GameContext) => ({ screen: null as Screen | null }));

export function openScreen(ctx: GameContext): Screen | null {
  return open(ctx).screen;
}

export function toggleScreen(ctx: GameContext, screen: Screen | null): void {
  const state = open(ctx);
  state.screen = state.screen === screen ? null : screen;
  ctx.touch();
}

export function setScreen(ctx: GameContext, screen: Screen | null): void {
  open(ctx).screen = screen;
  ctx.touch();
}

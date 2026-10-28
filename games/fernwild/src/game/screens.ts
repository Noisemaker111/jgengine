import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

/** Which full-screen survivor panel is open: ARK's inventory (with crafting and stats), the engram list, the dossier of creatures and notes, a creature's inventory, or the Green Obelisk's terminal. */
export type SurvivorScreen = "inventory" | "engrams" | "dossier" | "creature" | "obelisk";

const open = perContext((_ctx: GameContext) => ({ screen: null as SurvivorScreen | null }));

export function openScreen(ctx: GameContext): SurvivorScreen | null {
  return open(ctx).screen;
}

export function toggleScreen(ctx: GameContext, screen: SurvivorScreen | null): void {
  const state = open(ctx);
  state.screen = state.screen === screen ? null : screen;
  ctx.touch();
}

export function setScreen(ctx: GameContext, screen: SurvivorScreen | null): void {
  open(ctx).screen = screen;
  ctx.touch();
}

const detail = perContext((_ctx: GameContext) => ({ on: false }));

/** ARK's extended HUD (H): the numbers under each vital icon. */
export function extendedHud(ctx: GameContext): boolean {
  return detail(ctx).on;
}

export function toggleExtendedHud(ctx: GameContext): void {
  const state = detail(ctx);
  state.on = !state.on;
  ctx.touch();
}

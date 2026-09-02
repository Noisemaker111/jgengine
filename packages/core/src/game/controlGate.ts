import type { GameContext } from "../runtime/gameContext";
import { createActionContextStack, type ActionContextStack } from "../input/actionContexts";
import type { ActionCodesMap } from "../input/actionBindings";

export const PLAY_CONTROLS_STORE_KEY = "jg.playControls";
const ACTION_CONTEXTS = new WeakMap<GameContext, ActionContextStack>();

function contextsFor(ctx: GameContext): ActionContextStack {
  let stack = ACTION_CONTEXTS.get(ctx);
  if (stack === undefined) {
    stack = createActionContextStack();
    ACTION_CONTEXTS.set(ctx, stack);
  }
  return stack;
}

/** Returns the context stack associated with a game context. */
export function actionContextStack(ctx: GameContext): ActionContextStack {
  return contextsFor(ctx);
}

/** Applies active contexts to a base action map for shell input tracking. */
export function activeActionCodes(ctx: GameContext, base: ActionCodesMap): ActionCodesMap {
  const stack = contextsFor(ctx);
  const layered = createActionContextStack();
  layered.push({ id: "__jg_base_actions", codes: base, passthrough: true });
  for (const context of stack.snapshot().contexts) layered.push(context);
  return layered.active();
}

export function setPlayControlsActive(ctx: GameContext, active: boolean): void {
  const stack = contextsFor(ctx);
  if (active) stack.pop("menu");
  else stack.push({ id: "menu", codes: {}, passthrough: false });
  ctx.game.store.set(PLAY_CONTROLS_STORE_KEY, active);
}

export function playControlsActive(ctx: GameContext): boolean {
  return ctx.game.store.get(PLAY_CONTROLS_STORE_KEY) !== false &&
    !actionContextStack(ctx).snapshot().contexts.some((context) => context.id === "menu");
}

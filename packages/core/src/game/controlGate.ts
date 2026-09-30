import type { GameContext } from "../runtime/gameContext";
import { createActionContextStack, type ActionContextStack } from "../input/actionContexts";
import type { ActionCodesMap } from "../input/actionBindings";

export const PLAY_CONTROLS_STORE_KEY = "jg.playControls";
const SUSPENSION_PREFIX = "__jg_control_suspension:";
const ACTION_CONTEXTS = new WeakMap<GameContext, { stack: ActionContextStack; nextLease: number }>();

function contextsFor(ctx: GameContext): ActionContextStack {
  let state = ACTION_CONTEXTS.get(ctx);
  if (state === undefined) {
    const stack = createActionContextStack();
    state = {
      nextLease: 0,
      stack: {
        ...stack,
        snapshot: () => ({ contexts: stack.snapshot().contexts.filter((context) => !context.id.startsWith(SUSPENSION_PREFIX)) }),
        restore(snapshot) {
          const leases = stack.snapshot().contexts.filter((context) => context.id.startsWith(SUSPENSION_PREFIX));
          stack.restore({ contexts: [...snapshot.contexts.filter((context) => !context.id.startsWith(SUSPENSION_PREFIX)), ...leases] });
        },
      },
    };
    ACTION_CONTEXTS.set(ctx, state);
  }
  return state.stack;
}

/** Returns the context stack associated with a game context. */
export function actionContextStack(ctx: GameContext): ActionContextStack {
  return contextsFor(ctx);
}

/** Applies active contexts to a base action map for shell input tracking. */
export function activeActionCodes(ctx: GameContext, base: ActionCodesMap): ActionCodesMap {
  const stack = contextsFor(ctx);
  if (stack.ids().some((id) => id.startsWith(SUSPENSION_PREFIX))) return {};
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

/**
 * Suspends this context's player controls until the returned release function is called.
 * Independent owners compose; repeated release is safe and preserves the existing play gate.
 * Dispose the lease when its menu closes or its owning context unmounts.
 * Leases survive this context's binding restore and are excluded from saved binding state.
 * @capability control-suspension Suspend player input across overlapping menus without stopping shared simulation.
 */
export function suspendPlayControls(ctx: GameContext): () => void {
  const stack = contextsFor(ctx);
  const state = ACTION_CONTEXTS.get(ctx)!;
  let id: string;
  do { id = `${SUSPENSION_PREFIX}${state.nextLease++}`; } while (stack.ids().includes(id));
  stack.push({ id, codes: {}, passthrough: false });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    stack.pop(id);
  };
}

export function playControlsActive(ctx: GameContext): boolean {
  return ctx.game.store.get(PLAY_CONTROLS_STORE_KEY) !== false &&
    !actionContextStack(ctx).ids().some((id) => id === "menu" || id.startsWith(SUSPENSION_PREFIX));
}

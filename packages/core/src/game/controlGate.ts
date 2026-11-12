import type { GameContext } from "../runtime/gameContext";
import { createActionContextStack, type ActionContextStack } from "../input/actionContexts";
import type { ActionCodes, ActionCodesMap } from "../input/actionBindings";
import { applyBindingOverrides, type BindingOverrides } from "../input/bindingOverrides";
import { ContextMap } from "@jgengine/core/runtime/contextIdentity";

export const PLAY_CONTROLS_STORE_KEY = "jg.playControls";
const SUSPENSION_PREFIX = "__jg_control_suspension:";
interface ControlState {
  stack: ActionContextStack;
  nextLease: number;
  /** The player's rebinds, layered over the game's authored input before any context. */
  overrides: BindingOverrides;
  overridesVersion: number;
  listeners: Set<() => void>;
}

const ACTION_CONTEXTS = new ContextMap<ControlState>();

function controlState(ctx: GameContext): ControlState {
  let state = ACTION_CONTEXTS.get(ctx);
  if (state === undefined) {
    const stack = createActionContextStack();
    const made: ControlState = {
      nextLease: 0,
      overrides: {},
      overridesVersion: 0,
      listeners: new Set(),
      stack: {
        ...stack,
        // A rebind changes the live codes as a context does, so it bumps the same version and wakes the same listeners.
        version: () => stack.version() + made.overridesVersion,
        subscribe(listener) {
          const off = stack.subscribe(listener);
          made.listeners.add(listener);
          return () => {
            off();
            made.listeners.delete(listener);
          };
        },
        snapshot: () => ({ contexts: stack.snapshot().contexts.filter((context) => !context.id.startsWith(SUSPENSION_PREFIX)) }),
        restore(snapshot) {
          const leases = stack.snapshot().contexts.filter((context) => context.id.startsWith(SUSPENSION_PREFIX));
          stack.restore({ contexts: [...snapshot.contexts.filter((context) => !context.id.startsWith(SUSPENSION_PREFIX)), ...leases] });
        },
      },
    };
    state = made;
    ACTION_CONTEXTS.set(ctx, state);
  }
  return state;
}

function contextsFor(ctx: GameContext): ActionContextStack {
  return controlState(ctx).stack;
}

/** The player's rebinds in this game context: action to the codes that now drive it. */
export function bindingOverrides(ctx: GameContext): BindingOverrides {
  return controlState(ctx).overrides;
}

/**
 * Replace the player's rebinds (the shell seeds them from storage at boot). Live input picks them up through
 * {@link activeActionCodes}; listeners of {@link actionContextStack} hear the change.
 */
export function setBindingOverrides(ctx: GameContext, overrides: BindingOverrides): void {
  const state = controlState(ctx);
  state.overrides = { ...overrides };
  state.overridesVersion += 1;
  for (const listener of [...state.listeners]) listener();
}

/**
 * Bind an action to new codes, or back to the game's own with null. An action the game marks `locked` keeps its
 * codes whatever is stored.
 * @capability key-rebinding rebind a player action in the game itself, so menus, the shell and proofs all read the same keys
 */
export function rebindAction(ctx: GameContext, action: string, codes: ActionCodes | null): void {
  const next = { ...bindingOverrides(ctx) };
  if (codes === null) delete next[action];
  else next[action] = codes;
  setBindingOverrides(ctx, next);
}

/** Returns the context stack associated with a game context. */
export function actionContextStack(ctx: GameContext): ActionContextStack {
  return contextsFor(ctx);
}

/** The game's authored input with the player's rebinds over it: what each action is bound to, menus aside. */
export function reboundActionCodes(ctx: GameContext, base: ActionCodesMap): ActionCodesMap {
  return applyBindingOverrides(base, bindingOverrides(ctx));
}

/** Applies the player's rebinds, then the active contexts, to a base action map for shell input tracking. */
export function activeActionCodes(ctx: GameContext, base: ActionCodesMap): ActionCodesMap {
  const stack = contextsFor(ctx);
  if (stack.ids().some((id) => id.startsWith(SUSPENSION_PREFIX))) return {};
  const layered = createActionContextStack();
  layered.push({ id: "__jg_base_actions", codes: reboundActionCodes(ctx, base), passthrough: true });
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
  const state = controlState(ctx);
  const stack = state.stack;
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

/**
 * Why play controls are off in this context, empty when they are on: `"play controls off"` for the
 * store switch, then each gating action context id in stack order (`menu`, or `suspension` for each
 * {@link suspendPlayControls} lease). Lets a tool that finds play gated say what holds it.
 */
export function playGateReasons(ctx: GameContext): string[] {
  const reasons: string[] = [];
  if (ctx.game.store.get(PLAY_CONTROLS_STORE_KEY) === false) reasons.push("play controls off");
  for (const id of actionContextStack(ctx).ids()) {
    if (id === "menu") reasons.push("menu");
    else if (id.startsWith(SUSPENSION_PREFIX)) reasons.push("suspension");
  }
  return reasons;
}

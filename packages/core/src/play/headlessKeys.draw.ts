import { actionContextStack, activeActionCodes, reboundActionCodes } from "@jgengine/core/game/controlGate";
import { createActionStateTracker, toActionStateBindingMap } from "@jgengine/core/input/actionBindings";
import type { HeadlessPlayable } from "@jgengine/core/runtime/headlessRunner";

import { flowKeyList, type FlowKeys } from "./flow";
import type { PlaySession } from "./playSession.draw";

/** Keys held against a headless {@link PlaySession}, mapped through the game's own bindings. */
export interface HeadlessKeys {
  /** Press these keys; a key the game (with the player's rebinds) binds nowhere throws. */
  down(keys: FlowKeys): void;
  up(keys: FlowKeys): void;
  /** One tick with the held keys' actions, rebinding first when a menu context changed them. */
  tick(): void;
  /** Ticks that cover `ms` of game time, at least one. */
  ticksFor(ms: number): number;
}

/**
 * Hold keys on a headless play session the way the browser's keyboard does: each key resolves through
 * the game's input bindings and the active action contexts, so a key a menu switched off does nothing.
 * Shared by the headless flow runner and the game suite's proofs.
 *
 * @internal
 */
export function createHeadlessKeys(game: HeadlessPlayable, session: PlaySession): HeadlessKeys {
  const { ctx } = session;
  const tickMs = session.dt * 1000;
  const baseInput = game.game.input ?? {};
  const tracker = createActionStateTracker<string>(toActionStateBindingMap(activeActionCodes(ctx, baseInput)));
  const contexts = actionContextStack(ctx);
  let boundVersion = contexts.version();
  // What each key is bound to with the player's rebinds, menus aside: a key a rebind freed is bound nowhere.
  const baseTracker = createActionStateTracker<string>(toActionStateBindingMap(reboundActionCodes(ctx, baseInput)));
  const isBound = (key: string): boolean => {
    const bound = baseTracker.handleDown(key) !== null;
    baseTracker.reset();
    return bound;
  };
  const rebindIfChanged = (): void => {
    const version = contexts.version();
    if (version === boundVersion) return;
    boundVersion = version;
    tracker.rebind(toActionStateBindingMap(activeActionCodes(ctx, baseInput)));
    baseTracker.rebind(toActionStateBindingMap(reboundActionCodes(ctx, baseInput)));
  };
  return {
    down(keys) {
      for (const key of flowKeyList(keys)) {
        rebindIfChanged();
        if (!isBound(key)) throw new Error(`key ${key} is bound to no action in ${game.game.name}; bound actions: ${baseTracker.actions().join(", ")}`);
        tracker.handleDown(key);
      }
    },
    up(keys) {
      for (const key of flowKeyList(keys)) tracker.handleUp(key);
    },
    tick() {
      rebindIfChanged();
      session.tick(tracker.actions().filter((action) => tracker.isDown(action)));
      tracker.endFrame();
    },
    ticksFor: (ms) => Math.max(1, Math.ceil(ms / tickMs - 1e-9)),
  };
}

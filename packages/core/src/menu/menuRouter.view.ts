import { useCallback, useEffect, useMemo, useReducer } from "react";

/** A screen-stack transition. `reset` without an id collapses to the router's original root. */
export type MenuStackAction<Id extends string> =
  | { type: "open"; id: Id }
  | { type: "back" }
  | { type: "replace"; id: Id }
  | { type: "reset"; id?: Id };

/**
 * The pure screen-stack transition behind {@link useMenuRouter}. Exported so a game can drive the
 * same navigation from its own store or a replayable command log instead of React state.
 *
 * @capability menu-stack-reducer pure push/back/replace/reset transitions for a menu screen stack
 */
export function menuStackReducer<Id extends string>(
  path: readonly Id[],
  action: MenuStackAction<Id>,
  root: Id,
): readonly Id[] {
  switch (action.type) {
    case "open":
      return path[path.length - 1] === action.id ? path : [...path, action.id];
    case "back":
      return path.length <= 1 ? path : path.slice(0, -1);
    case "replace":
      return [...path.slice(0, -1), action.id];
    case "reset":
      return [action.id ?? root];
  }
}

/** A menu screen stack: where you are, how you got there, and how to go back. */
export interface MenuRouter<Id extends string> {
  /** The screen on top of the stack. */
  current: Id;
  /** The whole stack, root first — render breadcrumbs from it, or check depth. */
  path: readonly Id[];
  /** True when `current` is the root screen, so Escape has nowhere to go. */
  atRoot: boolean;
  /** Push a screen. Pushing the current screen again is a no-op. */
  open(id: Id): void;
  /** Pop one screen. A no-op at the root. */
  back(): void;
  /** Replace the top of the stack without deepening it. */
  replace(id: Id): void;
  /** Collapse to a root — the one passed, or the original. Use it when a run starts or ends. */
  reset(id?: Id): void;
}

/**
 * The screen stack behind a game front-end: title → save select → settings → credits, and Escape
 * back out. Every game menu needs this and none of it is game-specific, so it ships here rather
 * than being re-derived per game. Holds no content and imposes no look — the game decides what each
 * screen id renders.
 *
 * `escapeToBack` (default `true`) binds Escape to {@link MenuRouter.back}; pass `false` when the
 * game already owns the Escape key (a pause menu that toggles rather than pops).
 *
 * @capability menu-router screen stack for a game front-end — push/back/replace/reset with optional Escape-to-back
 */
export function useMenuRouter<Id extends string>(
  root: Id,
  options: { escapeToBack?: boolean } = {},
): MenuRouter<Id> {
  const { escapeToBack = true } = options;
  const [path, dispatch] = useReducer(
    (state: readonly Id[], action: MenuStackAction<Id>) => menuStackReducer(state, action, root),
    [root] as readonly Id[],
  );

  const open = useCallback((id: Id) => dispatch({ type: "open", id }), []);
  const back = useCallback(() => dispatch({ type: "back" }), []);
  const replace = useCallback((id: Id) => dispatch({ type: "replace", id }), []);
  const reset = useCallback((id?: Id) => dispatch({ type: "reset", id }), []);

  useEffect(() => {
    if (!escapeToBack) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "back" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [escapeToBack]);

  return useMemo(
    () => ({ current: path[path.length - 1]!, path, atRoot: path.length <= 1, open, back, replace, reset }),
    [path, open, back, replace, reset],
  );
}

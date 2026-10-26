import { createContext, createElement, useCallback, useContext, type ReactNode } from "react";

/** What happened to an engine HUD primitive. */
export type HudInteractKind = "hover" | "press" | "activate" | "focus" | "open" | "close";

/** One interaction reported by an engine HUD primitive to an `onInteract` listener. */
export interface HudInteractEvent {
  kind: HudInteractKind;
  /** The primitive's `cue` (also rendered as `data-jg-cue`), naming which feedback to play. */
  cue?: string;
  /** Primitive family, e.g. `"button"`, `"panel"`, `"window"`, `"action"`. */
  source: string;
}

/** Listener for {@link HudInteractEvent}s. */
export type HudInteractListener = (event: HudInteractEvent) => void;

const HudInteractContext = createContext<HudInteractListener | null>(null);

/**
 * Routes interactions from every engine HUD primitive below it (buttons, panels, windows, action
 * slots) to one listener — the seam a UI sound or haptics system hooks without per-button wiring.
 * Primitives also expose `data-jg-cue` and a per-instance `onInteract`.
 *
 * @capability hud-interact one listener for hover/press/activate/open/close from every engine HUD primitive
 */
export function HudInteractProvider({ onInteract, children }: { onInteract: HudInteractListener; children?: ReactNode }): ReactNode {
  const parent = useContext(HudInteractContext);
  const listener = useCallback<HudInteractListener>(
    (event) => {
      onInteract(event);
      parent?.(event);
    },
    [onInteract, parent],
  );
  return createElement(HudInteractContext.Provider, { value: listener }, children);
}

/** Returns a reporter that calls the instance listener, then the nearest {@link HudInteractProvider}. */
export function useHudInteract(source: string, cue?: string, onInteract?: HudInteractListener): (kind: HudInteractKind) => void {
  const context = useContext(HudInteractContext);
  return useCallback(
    (kind: HudInteractKind) => {
      if (onInteract === undefined && context === null) return;
      const event: HudInteractEvent = cue === undefined ? { kind, source } : { kind, source, cue };
      onInteract?.(event);
      context?.(event);
    },
    [context, cue, onInteract, source],
  );
}

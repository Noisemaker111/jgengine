import {
  resolveControlGroupIntent,
  type ControlGroupOptions,
} from "@jgengine/core/input/controlGroups";
import type { SelectionSet } from "@jgengine/core/scene/selection";
import type { SelectionBookmarks } from "@jgengine/core/scene/selectionBookmarks";

/** The key-event fields control groups read. @internal */
export interface ControlGroupKeyEvent {
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
}

/** The control-group digit for a top-row or numpad digit key code, else null. @internal */
export function controlGroupDigit(code: string): number | null {
  const match = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  return match === null ? null : Number(match[1]);
}

/** @internal */
export interface ControlGroupKeysDeps {
  groups: SelectionBookmarks;
  selection: SelectionSet;
  /** A stored id survives recall only while this passes (entity exists and is selectable). */
  isValid: (id: string) => boolean;
  /** Double-tap focus: called with the recalled ids. */
  focus: (ids: readonly string[]) => void;
  now: () => number;
  options?: ControlGroupOptions;
}

/**
 * Keyboard driver for RTS control groups over a bookmark store: Ctrl/Cmd+digit binds the selection,
 * Shift+digit appends it, a digit recalls (pruning stale ids), a second tap focuses. `handle` returns
 * true when the key belongs to control groups, so the caller keeps it from game action bindings.
 * Alt+digit is left alone. @internal
 */
export function createControlGroupKeys(deps: ControlGroupKeysDeps): { handle(event: ControlGroupKeyEvent): boolean; reset(): void } {
  let lastRecall: { key: string; at: number } | null = null;
  return {
    handle(event) {
      const digit = controlGroupDigit(event.code);
      if (digit === null || event.altKey === true) return false;
      if (event.repeat === true) return true;
      const now = deps.now();
      const intent = resolveControlGroupIntent(
        {
          digit,
          bindModifier: event.ctrlKey === true || event.metaKey === true,
          appendModifier: event.shiftKey === true,
          now,
          lastRecall,
        },
        deps.options,
      );
      if (intent.kind === "bind" || intent.kind === "append") {
        if (intent.kind === "bind") deps.groups.bind(intent.key, deps.selection.list());
        else deps.groups.append(intent.key, deps.selection.list());
        lastRecall = null;
        return true;
      }
      deps.groups.prune(deps.isValid);
      const ids = deps.groups.recall(intent.key);
      if (ids.length === 0) {
        lastRecall = null;
        return true;
      }
      deps.selection.replace(ids);
      lastRecall = { key: intent.key, at: now };
      if (intent.kind === "focus") deps.focus(ids);
      return true;
    },
    reset() {
      lastRecall = null;
    },
  };
}

/** Mean ground position (x, z) of the ids `positionOf` resolves, or null when none resolve. @internal */
export function groupCentroid(
  ids: readonly string[],
  positionOf: (id: string) => readonly [number, number, number] | null,
): { x: number; z: number } | null {
  let x = 0;
  let z = 0;
  let count = 0;
  for (const id of ids) {
    const position = positionOf(id);
    if (position === null) continue;
    x += position[0];
    z += position[2];
    count += 1;
  }
  return count === 0 ? null : { x: x / count, z: z / count };
}

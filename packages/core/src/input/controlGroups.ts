/**
 * Optional RTS binding composition over the genre-agnostic selection-bookmark
 * store (`@jgengine/core/scene/selectionBookmarks`). It maps the classic control-
 * group idiom — Ctrl+digit binds, digit recalls, a second digit tap within a
 * window focuses — onto opaque bookmark keys, without pulling input mapping into
 * the store. Games that want a different scheme (named bookmarks, gamepad, touch)
 * skip this and call the store directly.
 *
 * The resolver is pure: it turns a decoded key event plus the last-recall memory
 * into an intent, so the same logic works under any capture layer and stays
 * replay-safe. The caller owns actually binding/recalling and the focus hook.
 */

/** What a control-group key press means once modifiers and double-tap timing are resolved. */
export type ControlGroupIntent =
  /** Ctrl+digit: save the current selection under `key`. */
  | { kind: "bind"; key: string }
  /** Digit: recall the set saved under `key` into the active selection. */
  | { kind: "recall"; key: string }
  /** Second digit tap within the double-tap window: recall and focus the camera on `key`. */
  | { kind: "focus"; key: string };

/** A decoded control-group key press plus the memory needed to detect a double-tap. */
export interface ControlGroupInput {
  /** The pressed group digit, 0–9. */
  digit: number;
  /** True when a bind modifier (Ctrl by default) was held. */
  bindModifier: boolean;
  /** Monotonic time of this press, same clock as `lastRecall`. */
  now: number;
  /** The previous recall (its key and time), or null if none — drives double-tap focus detection. */
  lastRecall: { key: string; at: number } | null;
}

/** Tuning for the control-group idiom: the double-tap focus window and the bookmark-key namespace. */
export interface ControlGroupOptions {
  /** Max gap (ms) between two recalls of the same group that counts as a focus double-tap. Default 300. */
  doubleTapMs?: number;
  /** Prefix for the generated bookmark key, so control groups can share a store with other bookmarks. Default `""` (bare digit). */
  keyPrefix?: string;
}

/**
 * The stable bookmark key for a control-group `digit` under `options.keyPrefix` —
 * the key a caller passes to `SelectionBookmarks.bind`/`recall` to store a group
 * without going through {@link resolveControlGroupIntent}.
 *
 * @capability rts-control-groups map Ctrl+digit / digit / double-tap presses onto selection-bookmark bind / recall / focus intents
 */
export function controlGroupKey(digit: number, options: ControlGroupOptions = {}): string {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) {
    throw new Error(`controlGroupKey: digit must be an integer in [0, 9], got ${digit}`);
  }
  return `${options.keyPrefix ?? ""}${digit}`;
}

/**
 * Resolve a control-group key press into a {@link ControlGroupIntent}: Ctrl+digit
 * binds, a bare digit recalls, and a second recall of the same group within
 * `doubleTapMs` focuses. Pure — the caller applies the intent against the store
 * and its own focus hook, and records the returned recall for the next call.
 *
 * @capability rts-control-groups map Ctrl+digit / digit / double-tap presses onto selection-bookmark bind / recall / focus intents
 */
export function resolveControlGroupIntent(
  input: ControlGroupInput,
  options: ControlGroupOptions = {},
): ControlGroupIntent {
  const key = controlGroupKey(input.digit, options);
  if (input.bindModifier) return { kind: "bind", key };
  const doubleTapMs = options.doubleTapMs ?? 300;
  const isDoubleTap =
    input.lastRecall !== null && input.lastRecall.key === key && input.now - input.lastRecall.at <= doubleTapMs;
  return { kind: isDoubleTap ? "focus" : "recall", key };
}

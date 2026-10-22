/**
 * Headless focus-order model for a game front-end menu: a list or grid of item ids, one focused
 * item, and the keyboard/gamepad intents that move between them. It holds no React state, no DOM and
 * no look — `@jgengine/react/menuNav` binds it to a container and real focus, and each game decides
 * what the items are and where they sit.
 */

/** Directions a navigation intent can move the focused item. */
export type MenuNavDirection = "up" | "down" | "left" | "right" | "first" | "last";

/** Everything a key or gamepad button can ask a menu to do. */
export type MenuIntent = MenuNavDirection | "confirm" | "back";

/** The shape of the item list being navigated: how many items, how they wrap into rows. */
export interface MenuNavLayout {
  /** Number of items in the menu. */
  count: number;
  /**
   * Items per row. `1` (default) is a vertical list, so up/down move one item and left/right do
   * nothing. `count` is a single horizontal row. Any value in between is a grid.
   */
  columns?: number;
  /** Wrap past the first/last item instead of stopping. Default `true`. */
  wrap?: boolean;
  /** Item indices that are skipped by every move (disabled or hidden rows). */
  disabled?: readonly number[];
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function isDisabled(layout: MenuNavLayout, index: number): boolean {
  const disabled = layout.disabled;
  return disabled !== undefined && disabled.includes(index);
}

/**
 * The next focused index for a direction, or the same index when the move is a no-op. Moves skip
 * `disabled` indices and stop (rather than wrap) when every item in the way is disabled, so a menu
 * can never hand focus to a dead row.
 *
 * @capability menu-nav-move move menu focus by direction over a list or grid, skipping disabled items
 */
export function menuNavMove(index: number, direction: MenuNavDirection, layout: MenuNavLayout): number {
  const { count } = layout;
  if (count <= 0) return -1;
  const columns = Math.max(1, Math.min(layout.columns ?? 1, count));
  const wrap = layout.wrap ?? true;
  const start = clamp(index, 0, count - 1);
  if (direction === "first" || direction === "last") {
    const order = direction === "first" ? [...Array(count).keys()] : [...Array(count).keys()].reverse();
    for (const candidate of order) if (!isDisabled(layout, candidate)) return candidate;
    return start;
  }
  const horizontal = direction === "left" || direction === "right";
  if (horizontal && columns === 1) return start;
  const step = horizontal ? 1 : columns;
  const delta = direction === "up" || direction === "left" ? -step : step;
  let candidate = start;
  for (let attempt = 0; attempt < count; attempt += 1) {
    candidate += delta;
    if (candidate < 0 || candidate >= count) {
      if (!wrap) return start;
      candidate = candidate < 0 ? candidate + count : candidate - count;
    }
    if (horizontal && Math.floor(candidate / columns) !== Math.floor(start / columns)) return start;
    if (!isDisabled(layout, candidate)) return candidate;
  }
  return start;
}

/** The index of `id` in the focus order, or `-1` when it is not part of this menu. */
export function menuNavIndex(ids: readonly string[], id: string | null | undefined): number {
  if (id === null || id === undefined) return -1;
  return ids.indexOf(id);
}

/** The id at `index`, or `null` outside the list. */
export function menuNavIdAt(ids: readonly string[], index: number): string | null {
  if (index < 0 || index >= ids.length) return null;
  return ids[index] ?? null;
}

/** Keyboard codes that drive a menu, by `KeyboardEvent.code`. Tab is deliberately absent: it stays native. */
export const MENU_KEY_INTENTS: Readonly<Record<string, MenuIntent>> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Home: "first",
  End: "last",
  Enter: "confirm",
  NumpadEnter: "confirm",
  Space: "confirm",
  Escape: "back",
  Backspace: "back",
};

/**
 * Resolve a `KeyboardEvent.code` to a menu intent, or `null` for keys the menu leaves alone (typing,
 * Tab, shortcuts). Escape and Backspace both mean back; Space and Enter both mean confirm.
 *
 * @capability menu-key-intent resolve a keyboard code to a menu intent (move / confirm / back)
 */
export function menuIntentForKey(code: string): MenuIntent | null {
  return MENU_KEY_INTENTS[code] ?? null;
}

/**
 * Standard-mapping gamepad buttons as menu intents: A/Cross confirms, B/Circle and Start back, the
 * d-pad moves. Buttons with no menu meaning return `null`.
 *
 * @capability menu-pad-intent resolve a standard gamepad button to a menu intent
 */
export function menuIntentForPadButton(button: number): MenuIntent | null {
  switch (button) {
    case 0:
      return "confirm";
    case 1:
    case 9:
      return "back";
    case 12:
      return "up";
    case 13:
      return "down";
    case 14:
      return "left";
    case 15:
      return "right";
    default:
      return null;
  }
}

/**
 * Resolve a left-stick axis sample to a direction. Axis `0` is horizontal and axis `1` vertical
 * (standard mapping, up is negative); the larger magnitude wins so a diagonal push is one move.
 */
export function menuIntentForPadAxis(axis: number, value: number, deadzone = 0.55): MenuNavDirection | null {
  if (Math.abs(value) < deadzone) return null;
  if (axis === 0) return value > 0 ? "right" : "left";
  if (axis === 1) return value > 0 ? "down" : "up";
  return null;
}

/** Hold-to-repeat timing for a held d-pad/stick: one immediate move, then repeats. */
export interface MenuNavRepeat {
  /** Delay before the first repeat, ms. Default 320. */
  delayMs?: number;
  /** Delay between repeats, ms. Default 110. */
  intervalMs?: number;
}

/** When a held direction was pressed and when it last moved the focus. */
export interface MenuNavHold {
  /** Clock time (ms) the direction was first held. */
  pressedAt: number;
  /** Clock time (ms) of the last move it caused, or `null` before the first. */
  lastFiredAt: number | null;
}

/**
 * Whether a held direction should fire a move at `now`: immediately on press, then only after
 * `delayMs`, and no more often than `intervalMs`. Pure timing, so a gamepad poll and a keydown
 * handler share one rule.
 *
 * @capability menu-nav-repeat gate held menu navigation into an initial press plus repeats
 */
export function shouldRepeatMenuNav(now: number, hold: MenuNavHold, repeat: MenuNavRepeat = {}): boolean {
  if (hold.lastFiredAt === null) return true;
  const delay = repeat.delayMs ?? 320;
  const interval = repeat.intervalMs ?? 110;
  if (now - hold.pressedAt < delay) return false;
  return now - hold.lastFiredAt >= interval;
}

/**
 * Headless view model for a contextual action collection — the data layer behind an RTS command
 * card, an ability action bar, a build menu, or a radial. It carries *what the buttons mean*
 * (label, hotkey, cost, cooldown, disabled reasons, toggle state) with zero rendering opinion, so a
 * game keeps layout, dimensions, hotkeys, catalog-id mapping, renderer, and chrome caller-owned. The
 * React renderers in `@jgengine/react/actionHud` consume this; a game can swap either without
 * forking the logic here.
 */

/** A spendable-resource line on an action (e.g. `40` mana). `met` is false only when `available` is known and short. */
export interface ActionCost {
  resourceId: string;
  amount: number;
  /** Current pool, when the caller knows it — drives {@link ActionCost.met}. Omit when unknown. */
  available?: number;
  /** True unless `available` is known and below `amount`. */
  met: boolean;
}

/** Cooldown state for an action, expressed so a radial sweep or countdown can render directly. */
export interface ActionCooldown {
  remainingMs: number;
  totalMs: number;
  /** Remaining share of the cooldown, `0..1` — the fraction a radial wipe should still cover. */
  fraction: number;
  ready: boolean;
}

/** A single blocking reason: a stable machine `code` plus caller-facing `message`. */
export interface ActionReason {
  /** Stable tag for styling/branching, e.g. `"cooldown" | "cost" | "range" | "disabled"`. */
  code: string;
  message: string;
}

/**
 * A caller-authored contextual action — the DATA input to the model. Every field except `id` is
 * optional so a build button, a stance toggle, and a cooldown ability all use the same shape.
 * Catalog-id mapping (turning `icon`/`label` into art and copy) stays caller-owned.
 */
export interface ActionDef {
  id: string;
  label?: string;
  description?: string;
  /** Icon id / glyph the caller maps to a catalog; the model only carries it through. */
  icon?: string;
  /** Human hotkey label (e.g. `"Q"`, `"1"`). Matched case-insensitively by {@link actionByHotkey}. */
  hotkey?: string;
  /** Section id for grouping a large card into rows/tabs; caller-owned. */
  group?: string;
  cooldown?: ActionCooldown;
  costs?: readonly ActionCost[];
  /** Toggle/stance state — a mode that is currently on. */
  active?: boolean;
  /** Hard-disable regardless of cost/cooldown (not yet researched, no valid target). */
  disabled?: boolean;
  /** Extra caller reasons (out of range, needs tech). Merged after the derived cost/cooldown ones. */
  reasons?: readonly ActionReason[];
}

/**
 * A resolved action view model — availability computed once from cooldown, cost, `disabled`, and any
 * caller reasons. `enabled` is the single truth a renderer gates interaction on; `reasons` is the
 * ordered explanation (cooldown, then unmet costs, then caller reasons, then a generic disable).
 */
export interface ResolvedAction {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  hotkey?: string;
  group?: string;
  active: boolean;
  enabled: boolean;
  cooldown: ActionCooldown | null;
  costs: readonly ActionCost[];
  reasons: readonly ActionReason[];
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Build an {@link ActionCooldown} from remaining/total milliseconds. `ready` when nothing remains. */
export function actionCooldown(remainingMs: number, totalMs: number): ActionCooldown {
  const remaining = Math.max(0, remainingMs);
  const total = Math.max(0, totalMs);
  return {
    remainingMs: remaining,
    totalMs: total,
    fraction: total <= 0 ? 0 : clamp01(remaining / total),
    ready: remaining <= 0,
  };
}

/**
 * Build an {@link ActionCooldown} from remaining milliseconds and a known remaining fraction — the
 * shape adapters get from sources (like an ability snapshot) that report a fraction but not a total.
 */
export function actionCooldownFromFraction(remainingMs: number, fraction: number): ActionCooldown {
  const remaining = Math.max(0, remainingMs);
  const frac = clamp01(fraction);
  return {
    remainingMs: remaining,
    totalMs: frac > 0 ? Math.round(remaining / frac) : remaining,
    fraction: frac,
    ready: remaining <= 0,
  };
}

/** Build an {@link ActionCost}. `met` is true unless `available` is provided and below `amount`. */
export function actionCost(resourceId: string, amount: number, available?: number): ActionCost {
  const cost: ActionCost = {
    resourceId,
    amount,
    met: available === undefined ? true : available >= amount,
  };
  if (available !== undefined) cost.available = available;
  return cost;
}

/**
 * Resolve one {@link ActionDef} into a {@link ResolvedAction}: normalize label, compute `enabled`,
 * and order the blocking `reasons`. Pure — the same input always yields the same view model.
 */
export function resolveAction(def: ActionDef): ResolvedAction {
  const costs = def.costs ?? [];
  const reasons: ActionReason[] = [];
  const cooldown = def.cooldown ?? null;
  if (cooldown !== null && !cooldown.ready) {
    reasons.push({ code: "cooldown", message: cooldownMessage(cooldown) });
  }
  for (const cost of costs) {
    if (!cost.met) reasons.push({ code: "cost", message: costMessage(cost) });
  }
  for (const reason of def.reasons ?? []) reasons.push(reason);
  if (def.disabled === true && reasons.length === 0) {
    reasons.push({ code: "disabled", message: "Unavailable" });
  }
  const enabled = def.disabled !== true && reasons.length === 0;
  const resolved: ResolvedAction = {
    id: def.id,
    label: def.label ?? def.id,
    active: def.active === true,
    enabled,
    cooldown,
    costs,
    reasons,
  };
  if (def.description !== undefined) resolved.description = def.description;
  if (def.icon !== undefined) resolved.icon = def.icon;
  if (def.hotkey !== undefined) resolved.hotkey = def.hotkey;
  if (def.group !== undefined) resolved.group = def.group;
  return resolved;
}

/** Resolve an ordered list of actions, preserving input order. */
export function resolveActionCollection(defs: readonly ActionDef[]): ResolvedAction[] {
  return defs.map(resolveAction);
}

/** @internal Default cooldown reason copy: `Ready in 2.4s`. */
function cooldownMessage(cooldown: ActionCooldown): string {
  return `Ready in ${(cooldown.remainingMs / 1000).toFixed(1)}s`;
}

/** @internal Default unmet-cost reason copy: `Needs 40 mana`. */
function costMessage(cost: ActionCost): string {
  return `Needs ${cost.amount} ${cost.resourceId}`;
}

/**
 * Find the action whose `hotkey` matches `key`, case-insensitively — the keyboard-shortcut router for
 * an action bar. Returns the first match's id, or null. Matching by hotkey does not consider
 * `enabled`; the caller decides whether to fire a disabled action's feedback.
 */
export function actionByHotkey(actions: readonly ResolvedAction[], key: string): string | null {
  const needle = key.toLowerCase();
  for (const action of actions) {
    if (action.hotkey !== undefined && action.hotkey.toLowerCase() === needle) return action.id;
  }
  return null;
}

/** A focus move for keyboard/controller grid navigation over an action collection. */
export type FocusDirection = "left" | "right" | "up" | "down" | "next" | "prev" | "first" | "last";

/** Options for {@link moveGridFocus}. */
export interface GridFocusOptions {
  /** Wrap around edges instead of clamping (default false). */
  wrap?: boolean;
}

/**
 * Pure grid focus math for keyboard and controller navigation of an action card laid out in
 * `columns`-wide rows. Given the current index (`-1` for none) it returns the next index, clamped to
 * `[0, count)` — or wrapped when `wrap` is set. `left/right` move within/across columns, `up/down`
 * across rows, `next/prev` walk the flat order, `first/last` jump to the ends. Renderer-agnostic:
 * radial and list layouts pass `columns: 1` (or `count`) to get sensible 1-D stepping.
 */
export function moveGridFocus(
  current: number,
  count: number,
  columns: number,
  dir: FocusDirection,
  options?: GridFocusOptions,
): number {
  if (count <= 0) return -1;
  const cols = Math.max(1, Math.floor(columns));
  const wrap = options?.wrap === true;
  if (dir === "first") return 0;
  if (dir === "last") return count - 1;
  if (current < 0) {
    return dir === "prev" || dir === "left" || dir === "up" ? count - 1 : 0;
  }
  const clampIndex = (index: number): number => Math.max(0, Math.min(count - 1, index));
  if (dir === "next") return current + 1 >= count ? (wrap ? 0 : count - 1) : current + 1;
  if (dir === "prev") return current - 1 < 0 ? (wrap ? count - 1 : 0) : current - 1;
  const row = Math.floor(current / cols);
  const col = current % cols;
  if (dir === "right" || dir === "left") {
    const rowStart = row * cols;
    const rowEnd = Math.min(count - 1, rowStart + cols - 1);
    const width = rowEnd - rowStart + 1;
    if (width <= 1) return current;
    const nextCol = dir === "right" ? col + 1 : col - 1;
    if (nextCol < 0) return wrap ? rowEnd : current;
    if (nextCol > rowEnd - rowStart) return wrap ? rowStart : current;
    return rowStart + nextCol;
  }
  // up / down
  const nextRow = dir === "down" ? row + 1 : row - 1;
  const rowCount = Math.ceil(count / cols);
  if (nextRow < 0) return wrap ? clampIndex((rowCount - 1) * cols + col) : current;
  if (nextRow > rowCount - 1) return wrap ? col : current;
  const target = nextRow * cols + col;
  return target >= count ? (dir === "down" ? current : clampIndex(target)) : target;
}

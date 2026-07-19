import type { StatusInstance } from "./statusApplication";

/**
 * A serializable, presentation-ready snapshot of one active status for a timeline HUD row:
 * a stable list `id`, the free-string `kind` the game styles (color / label / icon), the
 * countdown-ring inputs `remainingMs` / `durationMs`, the `stacks` badge count, and the optional
 * `magnitude` in force. Derived from a live {@link StatusInstance} via {@link toStatusEffectView}.
 * The engine never interprets `kind` — it is a reference the game skins, not a built-in condition.
 */
export interface StatusEffectView {
  /** Stable list key. Defaults to the status id; override when several instances share a status. */
  id: string;
  /** The free-string status id (`"poison"`, `"haste"`, `"shield"`) — the game styles it. */
  kind: string;
  /** Milliseconds of life remaining (the numerator of the ring fraction). */
  remainingMs: number;
  /** The status's full (unelapsed) duration in ms (the ring denominator). */
  durationMs: number;
  /** Current stack count (>= 1 while active). */
  stacks: number;
  /** Per-application magnitude in force, when the source status tracks one. */
  magnitude?: number;
}

/** Options for {@link toStatusEffectView} / {@link toStatusEffectViews}. */
export interface StatusEffectViewOptions {
  /**
   * The status's full (unelapsed) duration in ms — the countdown-ring denominator. A fixed number,
   * or a resolver keyed off the instance (base durations usually live in the game's spec table, not
   * on the live {@link StatusInstance}, which only carries `remainingMs`). When omitted or
   * non-positive for an instance, the view reports `durationMs === remainingMs` so the ring shows
   * full — the elapsed fraction is simply unknown, never negative.
   */
  durationMs?: number | ((instance: StatusInstance) => number);
  /** Derive the stable list key; defaults to the status id. */
  id?: (instance: StatusInstance) => string;
}

function resolveDurationMs(instance: StatusInstance, options: StatusEffectViewOptions | undefined): number {
  const raw = typeof options?.durationMs === "function" ? options.durationMs(instance) : options?.durationMs;
  if (raw === undefined || !Number.isFinite(raw) || raw <= 0) return instance.remainingMs;
  return Math.max(raw, instance.remainingMs);
}

/**
 * Map one live {@link StatusInstance} to a serializable {@link StatusEffectView} for a HUD row.
 * Pure: no clock, no allocation beyond the returned view. The `durationMs` option supplies the ring
 * denominator the instance does not carry; without it the ring reads full.
 *
 * @capability status-effect-view adapt one live status instance into a serializable timeline-HUD view (id, kind, remaining/duration, stacks)
 */
export function toStatusEffectView(
  instance: StatusInstance,
  options?: StatusEffectViewOptions,
): StatusEffectView {
  const view: StatusEffectView = {
    id: options?.id?.(instance) ?? instance.status,
    kind: instance.status,
    remainingMs: Math.max(0, instance.remainingMs),
    durationMs: resolveDurationMs(instance, options),
    stacks: instance.stacks,
  };
  if (instance.magnitude !== 0) view.magnitude = instance.magnitude;
  return view;
}

/**
 * Map a list of live statuses (a target's carried {@link StatusInstance}s) to ordered HUD views.
 * Pure and allocation-bounded — one pass, one view per input — so a status bar can render straight
 * off the existing status model's snapshot without re-deriving ring math or timers.
 *
 * @capability status-effect-timeline adapt live status instances into serializable timeline-HUD views (id, kind, remaining/duration, stacks) for a countdown-ring effect bar
 */
export function toStatusEffectViews(
  instances: readonly StatusInstance[],
  options?: StatusEffectViewOptions,
): StatusEffectView[] {
  const views: StatusEffectView[] = [];
  for (const instance of instances) views.push(toStatusEffectView(instance, options));
  return views;
}

/**
 * Fraction of the countdown still remaining, clamped to `[0,1]` — the value a countdown ring fills
 * to. Returns `0` when the duration is non-positive. Pure; safe to call every frame.
 */
export function statusEffectRemainingFraction(view: StatusEffectView): number {
  if (view.durationMs <= 0) return 0;
  const fraction = view.remainingMs / view.durationMs;
  if (fraction < 0) return 0;
  if (fraction > 1) return 1;
  return fraction;
}

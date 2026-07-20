/**
 * One tier threshold in a {@link ComboMeter}. Tiers gate on the integer combo
 * `count` (not a filled fraction), and `id` is a free string the game owns and
 * styles ("good", "great", "savage", …) — the model never interprets it.
 */
export interface ComboTier {
  /** Combo count at or above which this tier becomes active. Tiers sort ascending. */
  threshold: number;
  /** Free-string tier id the game styles; the model never branches on it. */
  id: string;
  /** Explicit multiplier while this tier is active. Overrides any fallback curve. */
  multiplier?: number;
}

/** Options for {@link createComboMeter}. */
export interface ComboMeterConfig {
  /**
   * Decay window in ms: how long after the last {@link ComboMeter.hit} the combo
   * survives before it drops. Each `hit` resets this window; when it elapses the
   * combo drops (to 0, or by {@link ComboMeterConfig.dropStep}).
   */
  windowMs: number;
  /** Tier thresholds on the integer count. Sorted ascending internally; ids are free strings. */
  tiers?: readonly ComboTier[];
  /**
   * When the window elapses, drop the count by this many instead of clearing to 0,
   * re-arming the window so a long combo bleeds down step by step. Omit → drop to 0.
   */
  dropStep?: number;
  /**
   * Fallback multiplier growth when the active tier has no explicit `multiplier`:
   * `1 + (tierIndex + 1) * multiplierPerTier`. Below the first tier the multiplier
   * is always 1. Ignored where a tier sets its own `multiplier`.
   */
  multiplierPerTier?: number;
  /**
   * Last-resort multiplier curve when neither the active tier's `multiplier` nor
   * `multiplierPerTier` applies. Receives the current count and active tier index
   * (`-1` below the first tier). Not serialized — snapshot/restore carry state, not config.
   */
  multiplierCurve?: (count: number, tierIndex: number) => number;
  /** Injected clock (ms). Default `Date.now`. Ignored once {@link ComboMeter.update} drives time. */
  now?: () => number;
  /** Initial combo count (pre-seed a demo/save at a high chain). Default 0. */
  count?: number;
}

/**
 * A pooled, read-only snapshot of the live meter for a renderer to draw each
 * frame. Reused across {@link ComboMeter.view} calls and overwritten on the next
 * one — read it, do not retain it. For a save, use {@link ComboMeter.snapshot}.
 */
export interface ComboMeterView {
  /** Current combo count. */
  count: number;
  /** Highest count reached since the last {@link ComboMeter.reset}. */
  peak: number;
  /** Active tier id, or `null` below the first tier. */
  tier: string | null;
  /** Active tier index into the sorted tier list, or `-1` below the first tier. */
  tierIndex: number;
  /** Derived multiplier for the active tier (default 1). */
  multiplier: number;
  /** Milliseconds left in the decay window before the next drop (0 when idle). */
  remainingMs: number;
  /** Window remaining as `0..1` — for a draining ring/bar. */
  fraction: number;
  /** Free-string `kind` of the most recent hit, or `""` — carried through, never interpreted. */
  kind: string;
}

/** Serializable state for save/restore — clock-agnostic (stores time left, not an absolute deadline). */
export interface ComboMeterSnapshot {
  /** Combo count. */
  count: number;
  /** Peak count reached. */
  peak: number;
  /** Milliseconds remaining in the decay window at snapshot time. */
  remainingMs: number;
  /** Active tier id at snapshot time (recomputed on restore; kept for readability). */
  tier: string | null;
}

/**
 * A live, observable combo/multiplier meter — an integer hit chain with a decay
 * window, free-string tier thresholds, a derived multiplier, and peak tracking.
 */
export interface ComboMeter {
  /**
   * Register a landed hit: bump the count by one and reset the decay window. `kind`
   * is a free string carried through to {@link ComboMeter.view} for the renderer to
   * color/skin; the model never interprets it. Returns the new count.
   */
  hit(kind?: string): number;
  /**
   * Advance the decay window by `dtSeconds`, dropping the combo when the window
   * elapses. Calling this once switches the meter to delta-driven time (the injected
   * `now` clock is then ignored) — drive it each frame, or omit it and let reads read
   * `now`. Notifies subscribers when the count changes.
   */
  update(dtSeconds: number): void;
  /** Current combo count (processes any pending window expiry against the clock first). */
  count(): number;
  /** Highest count reached since the last {@link ComboMeter.reset}. */
  peak(): number;
  /** Active tier id, or `null` below the first tier. */
  tier(): string | null;
  /** Derived multiplier for the active tier (default 1). */
  multiplier(): number;
  /** Milliseconds left in the decay window before the next drop (0 when idle). */
  remainingMs(): number;
  /** Window remaining as `0..1`, for a draining ring/bar. */
  fraction(): number;
  /** The pooled view to draw this frame (do not retain). */
  view(): ComboMeterView;
  /** Clear the chain, peak, and window to empty. Notifies subscribers. */
  reset(): void;
  /** Patch config (window, tiers, drop step, multiplier curve) in place. Notifies subscribers. */
  configure(patch: Partial<ComboMeterConfig>): void;
  /** Observe changes (hit, drop, reset, configure, restore). Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** Serializable state for a save. */
  snapshot(): ComboMeterSnapshot;
  /** Restore from a {@link ComboMeterSnapshot}, re-anchoring the window to the current clock. */
  restore(snapshot: ComboMeterSnapshot): void;
}

function sortTiers(tiers: readonly ComboTier[] | undefined): ComboTier[] {
  return tiers === undefined ? [] : [...tiers].sort((a, b) => a.threshold - b.threshold);
}

/** Index of the highest tier whose `threshold` `count` has reached, or `-1` below the first. */
function activeIndex(count: number, tiers: readonly ComboTier[]): number {
  let idx = -1;
  for (let i = 0; i < tiers.length; i += 1) {
    if (count >= tiers[i]!.threshold) idx = i;
    else break;
  }
  return idx;
}

/**
 * A count-based combo / multiplier meter: an integer hit chain that climbs with
 * every `hit()` and drops when a decay window elapses, crossing free-string tier
 * thresholds ("good" → "great" → "savage") that derive a score multiplier, while
 * tracking the peak reached. Time is injected (`now`, default `Date.now`) and/or
 * driven by `update(dt)`; `view()` returns a pooled draw-state and
 * `snapshot`/`restore` round-trips the chain through a save.
 *
 * Distinct from the existing meters — reused none of them because none is this
 * shape: `stats/eventMeter` is a value/heat gauge that rises by tagged gains and
 * decays continuously (not an integer chain count with a reset-on-hit window);
 * `combat/comboPoints` is a finisher-point pool that hard-expires with no tiers,
 * multiplier, or subscribe; `stats/accumulatorMeter` is a float gauge crossing
 * `at`-value tiers, not a count with a draining window and derived multiplier.
 *
 * @capability combo-meter count-based combo/multiplier meter with a decay window, free-string tier thresholds, derived multiplier, peak tracking and snapshot/restore
 */
export function createComboMeter(config: ComboMeterConfig): ComboMeter {
  const now = config.now ?? Date.now;
  let windowMs = Math.max(0, config.windowMs);
  let tiers = sortTiers(config.tiers);
  let dropStep = config.dropStep;
  let multiplierPerTier = config.multiplierPerTier;
  let multiplierCurve = config.multiplierCurve;

  let count = Math.max(0, Math.floor(config.count ?? 0));
  let peak = count;
  let kind = "";

  // Logical clock (ms). `manual` flips true on the first update(dt) call, after
  // which the injected `now` is ignored and only update(dt) advances time.
  let manual = false;
  let time = now();
  let lastNow = time;
  // Absolute logical time the current window ends; null when the chain is empty.
  let deadline: number | null = count > 0 && windowMs > 0 ? time + windowMs : null;

  const listeners = new Set<() => void>();
  const pooledView: ComboMeterView = {
    count: 0,
    peak: 0,
    tier: null,
    tierIndex: -1,
    multiplier: 1,
    remainingMs: 0,
    fraction: 0,
    kind: "",
  };

  function notify(): void {
    for (const listener of listeners) listener();
  }

  /** Sync the logical clock from wall time unless update(dt) has taken over. */
  function syncWall(): void {
    if (manual) return;
    const t = now();
    time += t - lastNow;
    lastNow = t;
  }

  /** Drop the chain once for each elapsed window; returns whether anything changed. */
  function processExpiry(): boolean {
    if (deadline === null || windowMs <= 0) return false;
    let changed = false;
    while (deadline !== null && time >= deadline) {
      if (dropStep !== undefined && dropStep > 0 && count - dropStep > 0) {
        count -= dropStep;
        deadline += windowMs;
      } else {
        count = 0;
        deadline = null;
      }
      changed = true;
    }
    return changed;
  }

  /** Bring the clock and expiry state up to date before any read. */
  function pull(): void {
    syncWall();
    if (processExpiry()) notify();
  }

  function multiplierAt(c: number): number {
    const idx = activeIndex(c, tiers);
    if (idx >= 0) {
      const explicit = tiers[idx]!.multiplier;
      if (explicit !== undefined) return explicit;
    }
    if (multiplierPerTier !== undefined) return 1 + (idx + 1) * multiplierPerTier;
    if (multiplierCurve !== undefined) return multiplierCurve(c, idx);
    return 1;
  }

  function remaining(): number {
    if (count <= 0 || deadline === null) return 0;
    return Math.max(0, deadline - time);
  }

  return {
    hit(hitKind = "") {
      syncWall();
      processExpiry();
      count += 1;
      if (count > peak) peak = count;
      kind = hitKind;
      deadline = windowMs > 0 ? time + windowMs : null;
      notify();
      return count;
    },
    update(dtSeconds) {
      manual = true;
      if (dtSeconds > 0) time += dtSeconds * 1000;
      if (processExpiry()) notify();
    },
    count() {
      pull();
      return count;
    },
    peak() {
      pull();
      return peak;
    },
    tier() {
      pull();
      const idx = activeIndex(count, tiers);
      return idx >= 0 ? tiers[idx]!.id : null;
    },
    multiplier() {
      pull();
      return multiplierAt(count);
    },
    remainingMs() {
      pull();
      return remaining();
    },
    fraction() {
      pull();
      return windowMs <= 0 ? 0 : Math.max(0, Math.min(1, remaining() / windowMs));
    },
    view() {
      pull();
      const idx = activeIndex(count, tiers);
      const rem = remaining();
      pooledView.count = count;
      pooledView.peak = peak;
      pooledView.tier = idx >= 0 ? tiers[idx]!.id : null;
      pooledView.tierIndex = idx;
      pooledView.multiplier = multiplierAt(count);
      pooledView.remainingMs = rem;
      pooledView.fraction = windowMs <= 0 ? 0 : Math.max(0, Math.min(1, rem / windowMs));
      pooledView.kind = kind;
      return pooledView;
    },
    reset() {
      count = 0;
      peak = 0;
      kind = "";
      deadline = null;
      notify();
    },
    configure(patch) {
      if (patch.windowMs !== undefined) windowMs = Math.max(0, patch.windowMs);
      if (patch.tiers !== undefined) tiers = sortTiers(patch.tiers);
      if ("dropStep" in patch) dropStep = patch.dropStep;
      if ("multiplierPerTier" in patch) multiplierPerTier = patch.multiplierPerTier;
      if ("multiplierCurve" in patch) multiplierCurve = patch.multiplierCurve;
      // Re-arm the window if it changed while a chain is live.
      if (patch.windowMs !== undefined && count > 0) {
        deadline = windowMs > 0 ? time + windowMs : null;
      }
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      syncWall();
      processExpiry();
      const idx = activeIndex(count, tiers);
      return { count, peak, remainingMs: remaining(), tier: idx >= 0 ? tiers[idx]!.id : null };
    },
    restore(snapshot) {
      syncWall();
      count = Math.max(0, Math.floor(snapshot.count));
      peak = Math.max(count, Math.floor(snapshot.peak));
      kind = "";
      deadline = count > 0 && windowMs > 0 && snapshot.remainingMs > 0 ? time + snapshot.remainingMs : null;
      notify();
    },
  };
}

// @skill jgengine-ui
import { createFrameTimeWindow, type FrameTimePercentiles } from "./frameTimeWindow";

/** Game-owned thresholds for {@link createAutoQuality}; only `targetFrameMs` is required. */
export interface AutoQualityConfig {
  /** Frame time the game wants to hold, in ms (16.7 for 60 fps). */
  targetFrameMs: number;
  /** Step down when the window's p95 is above this. Default `targetFrameMs * 1.15`. */
  downFrameMs?: number;
  /** Step up only when the window's p95 is below `targetFrameMs * upMargin`. Default 0.6, so a tier that just failed is not retried at once. */
  upMargin?: number;
  /** Frames per decision window; a change needs a full window of frames measured at the current tier. Default 120. */
  windowFrames?: number;
  /** Ms after a change before the next step down. Default 4000. */
  downCooldownMs?: number;
  /** Ms after a change before a step up. Default 20000. */
  upCooldownMs?: number;
  /** A step down this soon after a step up multiplies the next up cooldown by 2, up to `maxBackoff`. Default 8. */
  maxBackoff?: number;
  /** Ms after start or reset to ignore, while shaders and assets settle. Default 3000. */
  warmupMs?: number;
  /** Lowest tier index auto may pick (into the tier list, low to high). Default 0. */
  minTier?: number;
  /** Highest tier index auto may pick. Default the last tier. */
  maxTier?: number;
}

/** What {@link AutoQuality.observe} returns when it moves the tier. */
export interface AutoQualityChange<TTier extends string> {
  from: TTier;
  to: TTier;
  direction: "down" | "up";
  window: FrameTimePercentiles;
}

/** Serializable controller state. */
export interface AutoQualityState<TTier extends string> {
  tier: TTier;
  changedAt: number;
  startedAt: number;
  backoff: number;
  lastDirection: "down" | "up" | null;
}

/** Picks a graphics tier from measured frame time. */
export interface AutoQuality<TTier extends string> {
  /** Feed one frame's duration; returns the change when the tier moved, else `null`. */
  observe(frameMs: number): AutoQualityChange<TTier> | null;
  tier(): TTier;
  /** The player picked a tier: adopt it, forget the window and restart the cooldowns. */
  setTier(tier: TTier): void;
  snapshot(): AutoQualityState<TTier>;
  restore(state: AutoQualityState<TTier>): void;
  reset(tier?: TTier): void;
}

/** Longest frame still counted; a longer one is a hidden tab or a debugger pause, not a load signal. */
export const AUTO_QUALITY_MAX_FRAME_MS = 1_000;

/**
 * Hysteresis controller: steps one tier down when p95 stays over `downFrameMs`, one tier up when it stays well
 * under the target, never inside a cooldown, and backs off when an up step is immediately undone. It only picks
 * the tier; the caller applies it and owns every per-effect toggle. Time comes from the injected clock.
 */
export function createAutoQuality<TTier extends string>(args: {
  tiers: readonly TTier[];
  initial: TTier;
  config: AutoQualityConfig;
  now: () => number;
}): AutoQuality<TTier> {
  const { tiers, config, now } = args;
  const target = config.targetFrameMs;
  if (!Number.isFinite(target) || target <= 0) throw new Error("targetFrameMs must be greater than zero");
  if (tiers.length === 0) throw new Error("tiers must not be empty");
  const downAbove = config.downFrameMs ?? target * 1.15;
  const upBelow = target * (config.upMargin ?? 0.6);
  const downCooldown = config.downCooldownMs ?? 4_000;
  const upCooldown = config.upCooldownMs ?? 20_000;
  const maxBackoff = config.maxBackoff ?? 8;
  const warmup = config.warmupMs ?? 3_000;
  const lowest = Math.max(0, config.minTier ?? 0);
  const highest = Math.min(tiers.length - 1, config.maxTier ?? tiers.length - 1);
  const window = createFrameTimeWindow(config.windowFrames ?? 120);

  const first = tiers[0];
  if (first === undefined) throw new Error("tiers must not be empty");
  const tierAt = (i: number): TTier => tiers[i] ?? first;
  const indexOf = (tier: TTier): number => Math.max(0, tiers.indexOf(tier));
  let index = indexOf(args.initial);
  let changedAt = now();
  let startedAt = changedAt;
  let backoff = 1;
  let lastDirection: "down" | "up" | null = null;

  function move(to: number, direction: "down" | "up", at: number): AutoQualityChange<TTier> {
    const measured = window.percentiles();
    const from = tierAt(index);
    if (direction === "up") {
      lastDirection = "up";
    } else {
      // Undoing a recent up step means the higher tier does not hold: wait longer before trying it again.
      if (lastDirection === "up" && at - changedAt < upCooldown * backoff) backoff = Math.min(maxBackoff, backoff * 2);
      lastDirection = "down";
    }
    index = to;
    changedAt = at;
    window.reset();
    return { from, to: tierAt(to), direction, window: measured };
  }

  return {
    observe(frameMs) {
      if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > AUTO_QUALITY_MAX_FRAME_MS) return null;
      const at = now();
      if (at - startedAt < warmup) return null;
      window.push(frameMs);
      if (!window.full()) return null;
      const { p95 } = window.percentiles();
      const since = at - changedAt;
      if (p95 > downAbove && index > lowest && since >= downCooldown) return move(index - 1, "down", at);
      if (p95 < upBelow && index < highest && since >= upCooldown * backoff) return move(index + 1, "up", at);
      return null;
    },
    tier: () => tierAt(index),
    setTier(tier) {
      index = indexOf(tier);
      changedAt = now();
      backoff = 1;
      lastDirection = null;
      window.reset();
    },
    snapshot: () => ({ tier: tierAt(index), changedAt, startedAt, backoff, lastDirection }),
    restore(state) {
      index = indexOf(state.tier);
      changedAt = state.changedAt;
      startedAt = state.startedAt;
      backoff = state.backoff;
      lastDirection = state.lastDirection;
      window.reset();
    },
    reset(tier) {
      if (tier !== undefined) index = indexOf(tier);
      changedAt = now();
      startedAt = changedAt;
      backoff = 1;
      lastDirection = null;
      window.reset();
    },
  };
}

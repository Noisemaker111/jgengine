/**
 * Encounter pressure: how hard a director leans on a player who is struggling, read from the
 * player's own state, quantized to a tier, and bounded by the rule's cap. The plan is a value, not
 * a callback, so a test can sweep it and a probe can print it.
 */

import { tierAt, type ThresholdBoundary } from "../threshold/thresholds";
import { clamp01 } from "../math/scalar";

export interface PressureReading {
  /** Player health fraction `0..1`. A healthier player is leaned on harder. */
  health: number;
  /** Encounter progress `0..1` — waves cleared over waves authored. Further in leans harder. */
  progress: number;
  /** Seconds the encounter has run. Longer leans harder, up to the window. */
  elapsed: number;
}

export interface PressureRule {
  healthWeight?: number;
  progressWeight?: number;
  timeWeight?: number;
  /** Seconds of encounter time before the clock term starts. Default `90`. */
  timeFloorSeconds?: number;
  /** Seconds at which the clock term is full. Default `300`. */
  timeWindowSeconds?: number;
  maxTier?: number;
}

/** One bounded answer to "how hard now", plus the effects the encounter layer applies. */
export interface PressurePlan {
  tier: number;
  /** The weighted reading in `0..1` before quantization. */
  index: number;
  countBonus: number;
  eliteSlots: number;
  cadenceScale: number;
  atCap: boolean;
  reason: string;
}

interface ResolvedRule {
  healthWeight: number;
  progressWeight: number;
  timeWeight: number;
  timeFloorSeconds: number;
  timeWindowSeconds: number;
  maxTier: number;
}

const RULE_DEFAULTS: ResolvedRule = {
  healthWeight: 0.5,
  progressWeight: 1,
  timeWeight: 0.5,
  timeFloorSeconds: 90,
  timeWindowSeconds: 300,
  maxTier: 2,
};

function resolveRule(rule: PressureRule): ResolvedRule {
  const maxTier = Math.max(0, Math.floor(rule.maxTier ?? RULE_DEFAULTS.maxTier));
  return {
    healthWeight: Math.max(0, rule.healthWeight ?? RULE_DEFAULTS.healthWeight),
    progressWeight: Math.max(0, rule.progressWeight ?? RULE_DEFAULTS.progressWeight),
    timeWeight: Math.max(0, rule.timeWeight ?? RULE_DEFAULTS.timeWeight),
    timeFloorSeconds: Math.max(0, rule.timeFloorSeconds ?? RULE_DEFAULTS.timeFloorSeconds),
    timeWindowSeconds: Math.max(1, rule.timeWindowSeconds ?? RULE_DEFAULTS.timeWindowSeconds),
    maxTier,
  };
}

/** The clock term in `0..1`: zero inside the floor, full at the end of the window. */
function timeTerm(elapsed: number, rule: ResolvedRule): number {
  const span = rule.timeWindowSeconds - rule.timeFloorSeconds;
  if (!(span > 0)) return elapsed >= rule.timeWindowSeconds ? 1 : 0;
  return clamp01((elapsed - rule.timeFloorSeconds) / span);
}

/** Cut points splitting the index `0..1` into `maxTier + 1` equal bands, cached per cap. */
const BANDS = new Map<number, readonly ThresholdBoundary<number>[]>();

function bandsFor(maxTier: number): readonly ThresholdBoundary<number>[] {
  const cached = BANDS.get(maxTier);
  if (cached !== undefined) return cached;
  const bands = Array.from({ length: maxTier + 1 }, (_, tier) => ({ id: tier, at: tier / (maxTier + 1) }));
  BANDS.set(maxTier, bands);
  return bands;
}

/**
 * Turn one reading into a bounded pressure plan.
 *
 * The index is the weighted mean of three terms — the player's health (staying in control), how far
 * through the encounter they are, and how long it has run — each clamped to `0..1`, then split into
 * `maxTier + 1` bands. A hurt player is leaned on *less*, so a director that reads this plan never
 * piles on someone already losing. Because every term and every derived effect is a clamp of an
 * authored cap, the rule cannot climb: a full-health player on a long run lands on
 * `tier === maxTier` with `countBonus === maxTier`, never above it.
 *
 * @capability encounter-pressure bounded difficulty tier read from player health, encounter progress and time
 */
export function evaluatePressure(reading: PressureReading, rule: PressureRule = {}): PressurePlan {
  const resolved = resolveRule(rule);
  const health = clamp01(Number.isFinite(reading.health) ? reading.health : 1);
  const progress = clamp01(Number.isFinite(reading.progress) ? reading.progress : 1);
  const elapsed = Number.isFinite(reading.elapsed) ? Math.max(0, reading.elapsed) : 0;
  const time = timeTerm(elapsed, resolved);

  const totalWeight = resolved.healthWeight + resolved.progressWeight + resolved.timeWeight;
  const index =
    totalWeight <= 0
      ? 0
      : clamp01(
          (resolved.healthWeight * health +
            resolved.progressWeight * progress +
            resolved.timeWeight * time) /
            totalWeight,
        );

  const tier = tierAt(bandsFor(resolved.maxTier), index)?.id ?? 0;
  return {
    tier,
    index,
    countBonus: tier,
    eliteSlots: Math.max(0, tier - 1),
    cadenceScale: 1 / (1 + tier / 2),
    atCap: tier >= resolved.maxTier,
    reason:
      `tier ${tier}/${resolved.maxTier}: health ${health.toFixed(2)}, progress ${progress.toFixed(2)}, ` +
      `time ${time.toFixed(2)} (${elapsed.toFixed(0)}s), index ${index.toFixed(2)}`,
  };
}

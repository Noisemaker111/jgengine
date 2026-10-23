/**
 * Encounter pressure: how hard a director leans on a player who is struggling, read from the
 * player's own state, quantized to a tier, and bounded by the rule's cap. The plan is a value, not
 * a callback, so a test can sweep it and a probe can print it.
 */

/** What the director reads about the player before it chooses a tier. */
export interface PressureReading {
  /** Player health fraction `0..1`. Lower leans harder. */
  health: number;
  /** Encounter progress `0..1` — waves cleared over waves authored. Lower leans harder. */
  progress: number;
  /** Seconds the encounter has run. Longer leans harder, up to the window. */
  elapsed: number;
}

/** The weights and window that turn a reading into an index, plus the hard cap. */
export interface PressureRule {
  /** Weight of low player health. Default `1`. */
  healthWeight?: number;
  /** Weight of the encounter not being finished. Default `1`. */
  progressWeight?: number;
  /** Weight of time spent past `timeFloorSeconds`. Default `0.5`. */
  timeWeight?: number;
  /** Seconds of encounter time before the clock term starts. Default `90`. */
  timeFloorSeconds?: number;
  /** Seconds at which the clock term is full. Default `300`. */
  timeWindowSeconds?: number;
  /** Highest tier this rule can reach. Default `2`. Every plan bound derives from it. */
  maxTier?: number;
}

/** One bounded answer to "how hard now", plus the effects the encounter layer applies. */
export interface PressurePlan {
  /** `0..maxTier`. */
  tier: number;
  /** The weighted reading in `0..1` before quantization. */
  index: number;
  /** Extra units each pressure-scaled group gains: `0..maxTier`. */
  countBonus: number;
  /** Extra elite slots unlocked: `0..maxTier`. */
  eliteSlots: number;
  /** Multiplier on authored entry delays, `>= 1 / (1 + maxTier / 2)`. */
  cadenceScale: number;
  /** True when the tier sits on the rule's cap. */
  atCap: boolean;
  /** One line naming the terms, for a probe or a test failure. */
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
  healthWeight: 1,
  progressWeight: 1,
  timeWeight: 0.5,
  timeFloorSeconds: 90,
  timeWindowSeconds: 300,
  maxTier: 2,
};

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

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

/**
 * Turn one reading into a bounded pressure plan.
 *
 * The index is the weighted mean of three terms — how hurt the player is (`1 - health`), how far
 * from finished the encounter is (`1 - progress`), and how long it has run — each clamped to
 * `0..1`, then split into `maxTier + 1` bands. Because every term and every derived effect is a
 * clamp of an authored cap, the rule cannot climb: a dead player on a stalled timer for an hour
 * lands on `tier === maxTier` with `countBonus === maxTier`, never above it.
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
          (resolved.healthWeight * (1 - health) +
            resolved.progressWeight * (1 - progress) +
            resolved.timeWeight * time) /
            totalWeight,
        );

  const tier = Math.min(resolved.maxTier, Math.max(0, Math.floor(index * (resolved.maxTier + 1))));
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

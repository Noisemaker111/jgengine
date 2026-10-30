import { devtools } from "../devtools/devtools";
import { changeMeter, createMeter, createStatPool, patchStatPool, tickMeter, type MeterState } from "../stats/statPool";
import { crossThresholds, tierAt, type ThresholdBoundary, type ThresholdCrossing } from "../threshold/thresholds";

/**
 * One remembered sighting of the target, as a perception service reports it — `PerceptionMemory`
 * from `sensor/perception` satisfies this shape.
 */
export interface AlertSighting {
  lastKnownPos: readonly [number, number, number];
  lastSeenAt: number;
  confidence: number;
  /** Whose senses produced the fact, and the observe pass it arrived on. */
  sourceId: string;
  sourceTick: number;
}

/**
 * The sight seam: what each observer remembers of the target, asked one observer at a time. Pass
 * `createPerception` (`sensor/perception`) straight in — a report counts when an observer still holds
 * the target in view, so there is no second sight path to keep in step.
 */
export interface AlertWitness {
  memoryOf(observerId: string, targetId: string): AlertSighting | null;
}

/** Where the alert last had the target, kept from the freshest sighting any observer remembers. */
export interface AlertAnchor {
  /** World XZ of the sighting. */
  at: readonly [number, number];
  lastSeenAt: number;
  sourceId: string;
  sourceTick: number;
}

/** Everything an alert level runs on; the game supplies it all. */
export interface AlertTuning<Tier> {
  /** Labelled cut points, ascending by `at`. Below the lowest there is no tier at all. */
  tiers: readonly ThresholdBoundary<Tier>[];
  /** Value bled per second once the target has been out of sight past `escapeSeconds`. */
  decayPerSecond: number;
  /** Extra seconds after the last gain before the bleeding starts. */
  decayDelaySeconds: number;
  /** Seconds out of every observer's sight before the target has escaped. */
  escapeSeconds: number;
  /** How stale a sighting may be and still count as in sight, seconds. */
  sightGraceSeconds: number;
  /** Seconds with no tier and units still active before `standDown` fires. */
  standDownSeconds: number;
  /** How much faster the sight clock and the bleeding run while the target is hidden. */
  hiddenRate: number;
  /** Value ceiling; omit for unbounded. */
  maxValue?: number;
}

/** Everything {@link createAlertLevel} needs: the sight seam, the observer roster and the caller's numbers. */
export interface AlertLevelConfig<Tier> {
  tuning: AlertTuning<Tier>;
  /** Bounded roster of observer ids to ask each tick. The caller owns and bounds it. */
  observers: () => readonly string[];
  /** The id the sight seam remembers the target by. */
  targetId: string;
  /** Remembered sightings, one per observer. */
  witness: AlertWitness;
  /** Register a devtools probe under this name so the overlay shows value, tier and the sight clock. */
  devtoolsName?: string;
}

/** Per-tick world facts {@link AlertLevel.tick} needs but cannot derive itself. */
export interface AlertTickContext {
  /** The clock the sightings are stamped on, milliseconds — the same one the observe pass got. */
  nowMs: number;
  /** Units the caller still has in play, for the stand-down countdown. */
  activeUnits: number;
  /**
   * The target is under cover no observer can see into: sightings stop counting, reports made now go
   * unseen, and the trail goes cold `hiddenRate` times faster.
   */
  hidden?: boolean;
}

/** One tick's answer: the value, the tier, the anchor and the escape. */
export interface AlertStep<Tier> {
  value: number;
  /** The game's tier at or below `value`; `null` below the lowest cut point. */
  tier: Tier | null;
  tierChanged: boolean;
  /** Cut points crossed this tick: up in ascending order, down in descending order. */
  crossings: readonly ThresholdCrossing<Tier>[];
  /** The freshest sighting the alert has kept so far, or `null`. */
  anchor: AlertAnchor | null;
  /** Seconds since any observer last had the target in view. */
  outOfSightSeconds: number;
  /** True once out of sight for `escapeSeconds`; the bleeding runs while it holds. */
  escaped: boolean;
  /** True exactly the tick a caller should call its units off — none are wanted and the beat has passed. */
  standDown: boolean;
}

/** Counters a devtools probe, a HUD or a test reads. */
export interface AlertStats {
  value: number;
  ticks: number;
  /** Reports made through `report`. */
  reported: number;
  /** Of those, the ones an observer held the target in view for. */
  seen: number;
  /** Sightings that moved the anchor. */
  sightings: number;
  /** Times the target broke sight for `escapeSeconds`. */
  escapes: number;
  /** Observer queries made in the last tick — one per observer on the roster. */
  observersChecked: number;
  /** Slowest single `tick` seen so far, milliseconds. */
  slowestTickMs: number;
}

/** Serializable alert state — the tuning, the meter, the sight clock, the anchor and the counters. */
export interface AlertLevelState<Tier> {
  tuning: AlertTuning<Tier>;
  value: number;
  sinceDrop: number;
  sinceFill: number;
  outOfSightSeconds: number;
  standDownElapsed: number;
  anchor: AlertAnchor | null;
  /** Reports that arrived since the last tick, judged for a sighting on the next one. */
  pending: readonly number[];
  counts: {
    ticks: number;
    reported: number;
    seen: number;
    sightings: number;
    escapes: number;
  };
}

/** Stateful alert/pursuit API with retuning and save/restore support. */
export interface AlertLevel<Tier> {
  /** Report something that should raise the alert. Whether it counts is decided on the next tick, from what observers remember. */
  report(amount: number): void;
  /** Take value off at once (a bribe, a favour, a paid fine); returns what is left. The tier follows at once. */
  forgive(amount: number): number;
  tick(dt: number, ctx: AlertTickContext): AlertStep<Tier>;
  /** The value right now and the tier it resolves to. */
  current(): { value: number; tier: Tier | null };
  stats(): AlertStats;
  /** Change the numbers while running; the meter keeps its value and clocks. */
  retune(patch: Partial<AlertTuning<Tier>>): void;
  state(): AlertLevelState<Tier>;
  restore(next: AlertLevelState<Tier>): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

const MAX_PENDING = 64;

function copyAnchor(anchor: AlertAnchor): AlertAnchor {
  const [x, z] = anchor.at;
  return {
    at: [x, z],
    lastSeenAt: anchor.lastSeenAt,
    sourceId: anchor.sourceId,
    sourceTick: anchor.sourceTick,
  };
}

function resolveTuning<Tier>(
  base: AlertTuning<Tier>,
  patch: Partial<AlertTuning<Tier>> | undefined,
): AlertTuning<Tier> {
  const next: AlertTuning<Tier> = {
    tiers: base.tiers.slice(),
    decayPerSecond: base.decayPerSecond,
    decayDelaySeconds: base.decayDelaySeconds,
    escapeSeconds: base.escapeSeconds,
    sightGraceSeconds: base.sightGraceSeconds,
    standDownSeconds: base.standDownSeconds,
    hiddenRate: base.hiddenRate,
  };
  if (base.maxValue !== undefined) next.maxValue = base.maxValue;
  if (patch !== undefined) {
    if (patch.tiers !== undefined) next.tiers = patch.tiers.slice();
    for (const key of [
      "decayPerSecond",
      "decayDelaySeconds",
      "escapeSeconds",
      "sightGraceSeconds",
      "standDownSeconds",
      "hiddenRate",
    ] as const) {
      const value = patch[key];
      if (typeof value === "number" && Number.isFinite(value)) next[key] = Math.max(0, value);
    }
    if (typeof patch.maxValue === "number" && Number.isFinite(patch.maxValue)) {
      next.maxValue = Math.max(0, patch.maxValue);
    }
  }
  next.escapeSeconds = Math.max(0.001, next.escapeSeconds);
  next.sightGraceSeconds = Math.max(0.001, next.sightGraceSeconds);
  validateTuning(next);
  return next;
}

function validateTuning<Tier>(tuning: AlertTuning<Tier>): void {
  let previous = -Infinity;
  for (const tier of tuning.tiers) {
    if (!Number.isFinite(tier.at) || tier.at < 0) throw new Error("every tier cut point must be finite and non-negative.");
    if (tier.at <= previous) throw new Error("tiers must ascend by cut point.");
    previous = tier.at;
  }
  for (const [name, value] of [
    ["decayPerSecond", tuning.decayPerSecond],
    ["decayDelaySeconds", tuning.decayDelaySeconds],
    ["standDownSeconds", tuning.standDownSeconds],
    ["hiddenRate", tuning.hiddenRate],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative.`);
  }
}

/**
 * An alert level any stealth, heist or pursuit game can use, over the meter and ladder parts: reports
 * raise a bounded value only while an observer holds the target in view, the value bleeds on the
 * caller's curve once the target has been out of every observer's sight, labelled cut points decide
 * what the alert resolves to, and a stand-down countdown tells the caller when to call its units off.
 * The value, its rates, the cut points and every label are caller policy; sight facts come from
 * `sensor/perception` memory (`sourceId`/`sourceTick` kept), so there is no second sight path.
 *
 * Deterministic: observers are asked in roster order, and the only variety is what they report. Bounded
 * per tick: one memory query per observer and one pass over the cut points.
 *
 * @capability alert-level witness-gated alert value, labelled cut points and a stand-down beat
 */
export function createAlertLevel<Tier>(config: AlertLevelConfig<Tier>): AlertLevel<Tier> {
  const witness = config.witness;
  const observers = config.observers;
  const targetId = config.targetId;

  let tuning = resolveTuning(config.tuning, undefined);
  let meter: MeterState = createMeter({ current: 0, max: resolvedMax(tuning) });
  let outOfSightSeconds = 0;
  let standDownElapsed = 0;
  let escaped = false;
  let anchor: AlertAnchor | null = null;
  const pending: number[] = [];
  let lastTier: ThresholdBoundary<Tier> | null = null;
  let counts = { ticks: 0, reported: 0, seen: 0, sightings: 0, escapes: 0 };
  let observersChecked = 0;
  let slowestTickMs = 0;

  function resolvedMax(from: AlertTuning<Tier>): number {
    return from.maxValue ?? Number.POSITIVE_INFINITY;
  }

  /** The freshest sighting on the roster, which is also what "in view" and the anchor read. */
  function freshest(): AlertSighting | null {
    let best: AlertSighting | null = null;
    observersChecked = 0;
    for (const observerId of observers()) {
      observersChecked += 1;
      const sighting = witness.memoryOf(observerId, targetId);
      if (sighting === null) continue;
      if (best === null || sighting.lastSeenAt > best.lastSeenAt) best = sighting;
    }
    return best;
  }

  function probeLine(): string {
    const tier = lastTier === null ? "no tier" : `tier at ${lastTier.at.toFixed(0)}`;
    return (
      `${meter.pool.current.toFixed(0)} value ${tier} ${outOfSightSeconds.toFixed(1)} s out of sight ` +
      `${counts.escapes} escapes ${counts.seen}/${counts.reported} seen ${slowestTickMs.toFixed(2)} ms slowest`
    );
  }

  const unregister = config.devtoolsName === undefined ? null : devtools.probes.register(config.devtoolsName, () => probeLine());

  function advance(dt: number, ctx: AlertTickContext): AlertStep<Tier> {
    const started = performance.now();
    const before = meter.pool.current;
    const hidden = ctx.hidden === true;
    const sighting = hidden ? null : freshest();
    const inSight = sighting !== null && ctx.nowMs - sighting.lastSeenAt <= tuning.sightGraceSeconds * 1000;
    // Hidden, the cold clocks run faster: the sight timer and the bleeding alike.
    const coldDt = hidden ? dt * Math.max(1, tuning.hiddenRate) : dt;
    if (sighting !== null && (anchor === null || sighting.lastSeenAt > anchor.lastSeenAt)) {
      anchor = {
        at: [sighting.lastKnownPos[0], sighting.lastKnownPos[2]],
        lastSeenAt: sighting.lastSeenAt,
        sourceId: sighting.sourceId,
        sourceTick: sighting.sourceTick,
      };
      counts.sightings += 1;
    }

    outOfSightSeconds = inSight ? 0 : outOfSightSeconds + coldDt;
    const nowEscaped = outOfSightSeconds >= tuning.escapeSeconds;
    if (nowEscaped && !escaped) counts.escapes += 1;
    escaped = nowEscaped;

    const reported = pending.length;
    if (reported > 0) {
      counts.reported += reported;
      if (inSight) {
        counts.seen += reported;
        for (const amount of pending) meter = changeMeter(meter, amount).meter;
      }
      pending.length = 0;
    }

    meter = tickMeter(
      meter,
      { decay: escaped ? tuning.decayPerSecond : 0, decayDelay: tuning.decayDelaySeconds },
      inSight ? dt : coldDt,
    ).meter;

    const resolved = tierAt(tuning.tiers, meter.pool.current);
    const previous = lastTier;
    lastTier = resolved;
    const tierChanged =
      (previous === null ? null : previous.id) !== (resolved === null ? null : resolved.id);

    let standDown = false;
    if (resolved === null && ctx.activeUnits > 0) {
      standDownElapsed += dt;
      if (standDownElapsed >= tuning.standDownSeconds) {
        standDown = true;
        standDownElapsed = 0;
      }
    } else {
      standDownElapsed = 0;
    }

    counts.ticks += 1;
    slowestTickMs = Math.max(slowestTickMs, performance.now() - started);

    return {
      value: meter.pool.current,
      tier: resolved === null ? null : resolved.id,
      tierChanged,
      crossings: crossThresholds(tuning.tiers, before, meter.pool.current),
      anchor,
      outOfSightSeconds,
      escaped,
      standDown,
    };
  }

  return {
    report(amount) {
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("report amount must be positive.");
      pending.push(amount);
      if (pending.length > MAX_PENDING) pending.shift();
    },
    forgive(amount) {
      if (!Number.isFinite(amount) || amount < 0) throw new Error("forgive amount must be non-negative.");
      meter = changeMeter(meter, -amount).meter;
      lastTier = tierAt(tuning.tiers, meter.pool.current);
      return meter.pool.current;
    },
    tick(dt, ctx) {
      if (!Number.isFinite(dt) || dt < 0) throw new Error("dt must be finite and non-negative.");
      if (!Number.isFinite(ctx.nowMs)) throw new Error("ctx.nowMs must be finite.");
      return advance(dt, ctx);
    },
    current: () => ({ value: meter.pool.current, tier: lastTier === null ? null : lastTier.id }),
    stats: () => ({
      value: meter.pool.current,
      ticks: counts.ticks,
      reported: counts.reported,
      seen: counts.seen,
      sightings: counts.sightings,
      escapes: counts.escapes,
      observersChecked,
      slowestTickMs,
    }),
    retune(patch) {
      tuning = resolveTuning(tuning, patch);
      meter = {
        ...meter,
        pool: patchStatPool(meter.pool, { max: resolvedMax(tuning) }),
      };
    },
    state() {
      return {
        tuning: { ...tuning, tiers: tuning.tiers.slice() },
        value: meter.pool.current,
        sinceDrop: meter.sinceDrop,
        sinceFill: meter.sinceFill,
        outOfSightSeconds,
        standDownElapsed,
        anchor: anchor === null ? null : copyAnchor(anchor),
        pending: pending.slice(),
        counts: { ...counts },
      };
    },
    restore(next) {
      tuning = resolveTuning(next.tuning, undefined);
      meter = {
        pool: createStatPool({ current: next.value, max: resolvedMax(tuning), min: 0 }),
        sinceDrop: Math.max(0, next.sinceDrop),
        sinceFill: Math.max(0, next.sinceFill),
      };
      outOfSightSeconds = Math.max(0, next.outOfSightSeconds);
      standDownElapsed = Math.max(0, next.standDownElapsed);
      anchor = next.anchor === null ? null : copyAnchor(next.anchor);
      pending.length = 0;
      for (const amount of next.pending) pending.push(amount);
      counts = { ...next.counts };
      escaped = outOfSightSeconds >= tuning.escapeSeconds;
      lastTier = tierAt(tuning.tiers, meter.pool.current);
      observersChecked = 0;
      slowestTickMs = 0;
    },
    dispose() {
      unregister?.();
    },
  };
}

import { evalCurve, leveling, type CurveDef, type LevelProgress, type LevelingTrack } from "../game/progression";

/** Named rule a level threshold grows by. `flat` repeats `step`; `linear` adds `growthRate` per level; `power` uses `level ^ growthRate`; `geometric` multiplies by `growthRate`; `table` reads `table`. */
export type XpGrowthRule = "flat" | "linear" | "power" | "geometric" | "table";

/**
 * Authorable XP curve data. Thresholds are generated from one growth rule, so a game states its
 * curve and its cap instead of hand-writing a table it cannot rebalance, and every consumer of the
 * same data agrees on the numbers.
 */
export interface XpCurveDef {
  growth: XpGrowthRule;
  /** XP needed for the first level-up (from `startLevel` to `startLevel + 1`). */
  step: number;
  /** Growth parameter: added XP per level (`linear`), the exponent (`power`) or the ratio (`geometric`). Ignored by `flat` and `table`. */
  growthRate?: number;
  /** Explicit thresholds for `growth: "table"`, index `0` being the first level-up. */
  table?: readonly number[];
  /** Highest reachable level. */
  maxLevel: number;
  /** First level of the curve (default `1`). */
  startLevel?: number;
  /** Rounding of generated thresholds (default `ceil`, so no level costs a fraction of XP). */
  round?: "floor" | "ceil" | "round";
}

/** One row of a resolved curve: the threshold at `level`, and the lifetime XP it sits at. */
export interface XpLevelStep {
  level: number;
  /** XP that leaves this level; `0` at the cap. */
  xpForLevel: number;
  /** XP accumulated from `startLevel` to reach `level`; `0` at the first level. */
  totalXp: number;
}

/** A resolved, validated {@link XpCurveDef}: thresholds, lifetime totals, a stated rule, and a leveling track bound to the same numbers. */
export interface XpCurve {
  /** Detached copy of the curve data, safe to save or send to a client. */
  readonly def: XpCurveDef;
  readonly maxLevel: number;
  readonly startLevel: number;
  /** The growth rule written out, e.g. `"power: 80 x level^1.45, ceil (levels 1-40)"`. */
  readonly rule: string;
  /** XP the given level requires to advance; `0` at or past `maxLevel`. */
  xpForLevel(level: number): number;
  /** Lifetime XP needed to reach `level` from `startLevel`. */
  totalXpFor(level: number): number;
  /** Resolve accumulated XP into a settled level, surplus and next threshold. */
  levelForXp(totalXp: number): LevelProgress;
  /** Every level of the curve with its threshold and lifetime XP. */
  table(): readonly XpLevelStep[];
  /** A `leveling` track configured with these exact thresholds and cap, for stat-adapter grants. */
  track(): LevelingTrack;
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new RangeError(message);
}

function curveDefOf(def: XpCurveDef): CurveDef | null {
  switch (def.growth) {
    case "flat":
      return { kind: "const", value: def.step };
    case "linear":
      return { kind: "linear", base: def.step, per: def.growthRate ?? 0 };
    case "power":
      return { kind: "power", base: def.step, exponent: def.growthRate ?? 1 };
    case "geometric":
      return { kind: "geometric", base: def.step, ratio: def.growthRate ?? 1 };
    case "table":
      return null;
  }
}

function describeRule(def: XpCurveDef, startLevel: number): string {
  const round = def.round ?? "ceil";
  const span = `levels ${startLevel}-${def.maxLevel}`;
  switch (def.growth) {
    case "flat":
      return `flat: ${def.step} xp per level, ${round} (${span})`;
    case "linear":
      return `linear: ${def.step} + ${def.growthRate ?? 0} x (level - ${startLevel}), ${round} (${span})`;
    case "power":
      return `power: ${def.step} x level^${def.growthRate ?? 1}, ${round} (${span})`;
    case "geometric":
      return `geometric: ${def.step} x ${def.growthRate ?? 1}^(level - ${startLevel}), ${round} (${span})`;
    case "table":
      return `table: ${def.table?.length ?? 0} thresholds (${span})`;
  }
}

/** Check curve data before use; throws `RangeError` naming the offending field. */
export function assertXpCurve(def: XpCurveDef): void {
  const startLevel = def.startLevel ?? 1;
  check(Number.isInteger(startLevel) && startLevel >= 1, `XP curve startLevel must be an integer >= 1; got ${String(def.startLevel)}`);
  check(Number.isInteger(def.maxLevel) && def.maxLevel > startLevel, `XP curve maxLevel must be an integer above startLevel ${startLevel}; got ${String(def.maxLevel)}`);
  check(Number.isFinite(def.step) && def.step > 0, `XP curve step must be positive; got ${String(def.step)}`);
  if (def.growth === "linear") {
    check(Number.isFinite(def.growthRate ?? 0) && (def.growthRate ?? 0) >= 0, "XP curve linear growthRate must be finite and >= 0");
  }
  if (def.growth === "power") {
    check(Number.isFinite(def.growthRate ?? 1) && (def.growthRate ?? 1) > 0, "XP curve power growthRate must be positive");
  }
  if (def.growth === "geometric") {
    check(Number.isFinite(def.growthRate ?? 1) && (def.growthRate ?? 1) > 0, "XP curve geometric growthRate must be positive");
  }
  if (def.growth === "table") {
    const needed = def.maxLevel - startLevel;
    check((def.table?.length ?? 0) >= needed, `XP curve table needs ${needed} thresholds for ${needed} level-ups`);
    for (const value of def.table ?? []) check(Number.isFinite(value) && value > 0, `XP curve table values must be positive; got ${String(value)}`);
  }
}

/**
 * Resolve authored XP curve data: the threshold per level, the lifetime XP it sits at, a plain-words
 * growth rule, and the level an XP total reaches under the cap. One data record with one growth rule
 * keeps a rebalance in the save-visible definition rather than in formulas scattered across a game.
 *
 * @capability xp-curve resolve an authored xp growth rule into per-level thresholds, totals and a level cap
 */
export function defineXpCurve(def: XpCurveDef): XpCurve {
  assertXpCurve(def);
  const startLevel = def.startLevel ?? 1;
  const maxLevel = def.maxLevel;
  const round = def.round ?? "ceil";
  const growthCurve = curveDefOf(def);

  const rawThreshold = (level: number): number => {
    if (growthCurve === null) {
      const index = level - startLevel;
      const table = def.table ?? [];
      return table[Math.min(index, table.length - 1)] ?? 0;
    }
    const relative = level - startLevel + 1;
    const x = growthCurve.kind === "linear" || growthCurve.kind === "geometric" ? relative - 1 : relative;
    return evalCurve({ ...growthCurve, round }, x);
  };

  const xpForLevel = (level: number): number => {
    if (level >= maxLevel) return 0;
    const clamped = Math.max(startLevel, Math.min(level, maxLevel - 1));
    return Math.max(1, rawThreshold(clamped));
  };

  const totalXpFor = (level: number): number => {
    const clamped = Math.max(startLevel, Math.min(level, maxLevel));
    let total = 0;
    for (let current = startLevel; current < clamped; current += 1) total += xpForLevel(current);
    return total;
  };

  const readTable = (): XpLevelStep[] => {
    const rows: XpLevelStep[] = [];
    let total = 0;
    for (let level = startLevel; level <= maxLevel; level += 1) {
      const threshold = xpForLevel(level);
      rows.push({ level, xpForLevel: threshold, totalXp: total });
      total += threshold;
    }
    return rows;
  };

  const copy: XpCurveDef = {
    growth: def.growth,
    step: def.step,
    maxLevel,
    startLevel,
    round,
    ...(def.growthRate === undefined ? {} : { growthRate: def.growthRate }),
    ...(def.table === undefined ? {} : { table: [...def.table] }),
  };

  let trackCache: LevelingTrack | null = null;
  const buildTrack = (): LevelingTrack =>
    leveling({
      // `steps` indexes by level number, so the array is level-addressed rather than offset.
      xpForLevel: {
        kind: "steps",
        values: Array.from({ length: maxLevel + 1 }, (_, level) => xpForLevel(Math.max(startLevel, level))),
      },
      maxLevel,
      startLevel,
      thresholdMode: "perLevel",
    });

  return {
    def: copy,
    maxLevel,
    startLevel,
    rule: describeRule(copy, startLevel),
    xpForLevel,
    totalXpFor,
    levelForXp(totalXp) {
      trackCache ??= buildTrack();
      return trackCache.resolve(startLevel, totalXp);
    },
    table: readTable,
    track() {
      trackCache ??= buildTrack();
      return trackCache;
    },
  };
}

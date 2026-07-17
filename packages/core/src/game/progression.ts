/**
 * The shape of a progression curve before rounding/clamping: a constant, a
 * linear ramp, a `power` or `geometric` growth, discrete `steps`, or a
 * `piecewise` interpolation between explicit points. Feed it to {@link evalCurve}.
 */
export type CurveDef =
  | { kind: "const"; value: number }
  | { kind: "linear"; base: number; per: number }
  | { kind: "power"; base: number; exponent: number }
  | { kind: "geometric"; base: number; ratio: number }
  | { kind: "steps"; values: number[] }
  | { kind: "piecewise"; points: [number, number][] };

/** Post-evaluation adjustments applied to a curve's raw output: rounding mode and min/max clamp. */
export interface CurveShape {
  round?: "floor" | "ceil" | "round";
  min?: number;
  max?: number;
}

/** A fully specified progression curve — a {@link CurveDef} growth shape plus optional {@link CurveShape} rounding/clamp. */
export type Curve = CurveDef & CurveShape;

function rawCurve(def: CurveDef, x: number): number {
  switch (def.kind) {
    case "const":
      return def.value;
    case "linear":
      return def.base + def.per * x;
    case "power":
      return def.base * x ** def.exponent;
    case "geometric":
      return def.base * def.ratio ** x;
    case "steps": {
      const i = Math.max(0, Math.min(def.values.length - 1, Math.floor(x)));
      return def.values[i];
    }
    case "piecewise":
      return interpolate(def.points, x);
  }
}

function interpolate(points: [number, number][], x: number): number {
  if (points.length === 0) return 0;
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      const span = x1 - x0;
      const t = span === 0 ? 0 : (x - x0) / span;
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

/**
 * Evaluate a progression {@link Curve} at position `x`, applying its rounding
 * mode and min/max clamp. This is the shared numeric backbone for XP-per-level,
 * cost ramps, difficulty scaling, and any other level/rank → value mapping — use
 * it instead of hand-rolling growth formulas.
 *
 * @capability progression-curve evaluate a level/rank curve (const, linear, power, geometric, steps, piecewise) at a point
 */
export function evalCurve(spec: Curve, x: number): number {
  let y = rawCurve(spec, x);
  if (spec.min !== undefined) y = Math.max(spec.min, y);
  if (spec.max !== undefined) y = Math.min(spec.max, y);
  switch (spec.round) {
    case "floor":
      return Math.floor(y);
    case "ceil":
      return Math.ceil(y);
    case "round":
      return Math.round(y);
    default:
      return y;
  }
}

/** Bind a {@link Curve} into a reusable `(x) => value` evaluator — a partial application of {@link evalCurve}. */
export function curve(spec: Curve): (x: number) => number {
  return (x) => evalCurve(spec, x);
}

/** Result of resolving a level+xp pair: the settled `level`, leftover `xp` into the current level, the `xpMax` threshold for the next level, and how many `levelsGained` this resolution produced. */
export interface LevelProgress {
  level: number;
  xp: number;
  xpMax: number;
  levelsGained: number;
}

/**
 * Configuration for a {@link leveling} track: the `xpForLevel` {@link Curve}, the
 * `maxLevel` cap, and optional `startLevel`, stat ids (`xpStat`/`levelStat`,
 * default `"xp"`/`"level"`), and `thresholdMode` — `"perLevel"` (each level costs
 * its own curve value) or `"cumulative"` (curve gives the total xp to reach a level).
 */
export interface LevelingConfig {
  xpForLevel: Curve;
  maxLevel: number;
  startLevel?: number;
  xpStat?: string;
  levelStat?: string;
  thresholdMode?: "perLevel" | "cumulative";
}

/** Adapter a {@link LevelingTrack} uses to read and write a user's level/xp stats, so the track stays decoupled from any concrete stats store. */
export interface LevelingStatAccess {
  get(userId: string, statId: string): { current: number; max: number } | null;
  set(userId: string, statId: string, patch: { current?: number; max?: number }): unknown;
}

/** A resolved leveling track: the immutable `maxLevel`/`startLevel`, the `xpForLevel` threshold lookup, a pure `resolve`, and `grantXp` which writes back through a {@link LevelingStatAccess} and fires an `onLevelUp` callback. */
export interface LevelingTrack {
  readonly maxLevel: number;
  readonly startLevel: number;
  xpForLevel(level: number): number;
  resolve(level: number, xp: number): LevelProgress;
  grantXp(
    access: LevelingStatAccess,
    userId: string,
    amount: number,
    onLevelUp?: (level: number) => void,
  ): number;
}

/**
 * Build a leveling track from an xp-per-level {@link Curve} and a max level. The
 * returned {@link LevelingTrack} resolves how many levels a given xp total earns
 * (rolling over surplus xp, capping at `maxLevel`) and, via `grantXp`, writes the
 * new level/xp back through a {@link LevelingStatAccess} and fires `onLevelUp` for
 * each level gained. Reach for this instead of hand-tracking xp thresholds; pair
 * it with `resource-pool` (mana/stamina) and `ability-bar` (cooldowns) for a hero.
 *
 * @capability leveling-track grant XP, resolve level-ups against a curve, and write level+xp stats back through a stat adapter
 */
export function leveling(config: LevelingConfig): LevelingTrack {
  const maxLevel = config.maxLevel;
  const startLevel = config.startLevel ?? 1;
  const xpStat = config.xpStat ?? "xp";
  const levelStat = config.levelStat ?? "level";
  const thresholdMode = config.thresholdMode ?? "perLevel";

  const xpForLevel = (level: number): number => {
    if (thresholdMode === "cumulative" && level <= startLevel) return 0;
    return evalCurve(config.xpForLevel, level);
  };

  const resolvePerLevel = (level: number, xp: number): LevelProgress => {
    let currentLevel = level;
    let currentXp = xp;
    let levelsGained = 0;
    while (currentLevel < maxLevel && currentXp >= xpForLevel(currentLevel)) {
      currentXp -= xpForLevel(currentLevel);
      currentLevel += 1;
      levelsGained += 1;
    }
    if (currentLevel >= maxLevel) currentXp = 0;
    return {
      level: currentLevel,
      xp: currentXp,
      xpMax: xpForLevel(Math.min(currentLevel, maxLevel)),
      levelsGained,
    };
  };

  const resolveCumulative = (level: number, xp: number): LevelProgress => {
    let currentLevel = level;
    let levelsGained = 0;
    while (currentLevel < maxLevel && xp >= xpForLevel(currentLevel + 1)) {
      currentLevel += 1;
      levelsGained += 1;
    }
    const capped = currentLevel >= maxLevel;
    return {
      level: currentLevel,
      xp: capped ? xpForLevel(maxLevel) : xp,
      xpMax: capped ? xpForLevel(maxLevel) : xpForLevel(currentLevel + 1),
      levelsGained,
    };
  };

  const resolve = (level: number, xp: number): LevelProgress =>
    thresholdMode === "cumulative" ? resolveCumulative(level, xp) : resolvePerLevel(level, xp);

  const grantXp = (
    access: LevelingStatAccess,
    userId: string,
    amount: number,
    onLevelUp?: (level: number) => void,
  ): number => {
    const xp = access.get(userId, xpStat);
    const level = access.get(userId, levelStat);
    if (xp === null || level === null) return 0;
    const progress = resolve(level.current, xp.current + amount);
    access.set(userId, xpStat, { current: progress.xp, max: progress.xpMax });
    if (progress.levelsGained > 0) {
      access.set(userId, levelStat, { current: progress.level });
      onLevelUp?.(progress.level);
    }
    return progress.levelsGained;
  };

  return { maxLevel, startLevel, xpForLevel, resolve, grantXp };
}

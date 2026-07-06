export type CurveDef =
  | { kind: "const"; value: number }
  | { kind: "linear"; base: number; per: number }
  | { kind: "power"; base: number; exponent: number }
  | { kind: "geometric"; base: number; ratio: number }
  | { kind: "steps"; values: number[] }
  | { kind: "piecewise"; points: [number, number][] };

export interface CurveShape {
  round?: "floor" | "ceil" | "round";
  min?: number;
  max?: number;
}

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

export function curve(spec: Curve): (x: number) => number {
  return (x) => evalCurve(spec, x);
}

export interface LevelProgress {
  level: number;
  xp: number;
  xpMax: number;
  levelsGained: number;
}

export interface LevelingConfig {
  xpForLevel: Curve;
  maxLevel: number;
  startLevel?: number;
  xpStat?: string;
  levelStat?: string;
}

export interface LevelingStatAccess {
  get(userId: string, statId: string): { current: number; max: number } | null;
  set(userId: string, statId: string, patch: { current?: number; max?: number }): unknown;
}

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

export function leveling(config: LevelingConfig): LevelingTrack {
  const maxLevel = config.maxLevel;
  const startLevel = config.startLevel ?? 1;
  const xpStat = config.xpStat ?? "xp";
  const levelStat = config.levelStat ?? "level";

  const xpForLevel = (level: number): number => evalCurve(config.xpForLevel, level);

  const resolve = (level: number, xp: number): LevelProgress => {
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

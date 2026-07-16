import { randomSeedFrom, stepRandomSeed, type RandomSeed } from "../random/rng";

/** A world-space `[x, z]` used for the heat system's spawn ring and witness proximity checks. */
export type HeatPoint = readonly [number, number];

/** One escalation tier — the heat threshold it begins at and the pursuer count it wants active. */
export interface HeatLevelDef {
  /** Ascending level number (1, 2, 3, ...); level 0 is implicit below the first threshold. */
  level: number;
  /** Cumulative heat at which this level begins. */
  threshold: number;
  /** Active pursuers this level wants once reached. */
  pursuerBudget: number;
}

/** Tuning for {@link createHeatState}/{@link advanceHeat} — levels, decay, and pursuit-spawn ring. */
export interface HeatConfig {
  /** Sorted ascending by `threshold`. */
  levels: readonly HeatLevelDef[];
  maxHeat?: number;
  /** Heat bled per second once decay is unblocked. */
  decayPerSecond: number;
  /** Seconds after the last witnessed gain before decay starts (a beat of "still hot" after the last crime). */
  decayDelaySeconds?: number;
  /** Seconds at level 0 with pursuers still alive before {@link HeatStep.standDown} fires. */
  standDownSeconds?: number;
  /** `[min, max]` radius for {@link HeatStep.spawnPoints}; omit to skip ring generation. */
  spawnRingRadius?: readonly [number, number];
  seed?: number;
}

/** Serializable heat-system state — round-trips through `createHeatState`/`advanceHeat` each tick. */
export interface HeatState {
  heat: number;
  level: number;
  sinceGain: number;
  standDownElapsed: number;
  /** Opaque PRNG cursor — round-trip it as part of the state, never read or set it directly. */
  rng: RandomSeed;
}

/** One crime tick's contribution — only `witnessed` gains raise heat (unseen crimes are free, GTA-style). */
export interface HeatGain {
  amount: number;
  witnessed: boolean;
}

/** Per-tick world facts {@link advanceHeat} needs but can't derive itself — witness proximity, pursuer count, origin. */
export interface HeatTickContext {
  /** True blocks decay this tick (a witness/pursuer is still close enough to keep the heat hot). */
  nearWitness: boolean;
  activePursuers: number;
  around: HeatPoint;
}

/** One `advanceHeat` tick's result — updated state plus what the caller should spawn/despawn. */
export interface HeatStep {
  state: HeatState;
  levelChanged: boolean;
  pursuerBudget: number;
  /** `max(0, pursuerBudget - activePursuers)` — how many more pursuers to spawn this tick. */
  wantSpawns: number;
  /** `wantSpawns` points on the configured ring around `ctx.around`; empty without `spawnRingRadius`. */
  spawnPoints: HeatPoint[];
  /** True exactly the tick pursuit should fully clear — despawn every remaining pursuer. */
  standDown: boolean;
}

function levelFor(levels: readonly HeatLevelDef[], heat: number): HeatLevelDef | null {
  let current: HeatLevelDef | null = null;
  for (const level of levels) {
    if (heat >= level.threshold) current = level;
  }
  return current;
}

/**
 * Escalating crime/heat/pursuit state machine (#533.4) — the star-meter every open-world crime sandbox
 * hand-rolls: witness-scoped gain (unseen crimes don't raise heat), proximity-gated decay (still hot
 * while a witness or pursuer is close), tiered pursuer budgets, ring-shaped spawn points around the
 * player, and a stand-down countdown once heat clears so pursuit doesn't vanish instantly. Pure and
 * seeded like `ai/spawnDirector` — the caller owns spawning/despawning the actual entities.
  * @internal
  */
export function createHeatState(config: HeatConfig): HeatState {
  return {
    heat: 0,
    level: 0,
    sinceGain: Number.POSITIVE_INFINITY,
    standDownElapsed: 0,
    rng: randomSeedFrom(config.seed ?? 1),
  };
}

function ringPoints(
  around: HeatPoint,
  count: number,
  radius: readonly [number, number],
  rng: RandomSeed,
): { points: HeatPoint[]; rng: RandomSeed } {
  const points: HeatPoint[] = [];
  let seed = rng;
  const [minR, maxR] = radius;
  for (let i = 0; i < count; i += 1) {
    let roll: number;
    [roll, seed] = stepRandomSeed(seed);
    const angle = roll * Math.PI * 2;
    let spread: number;
    [spread, seed] = stepRandomSeed(seed);
    const distance = minR + spread * Math.max(0, maxR - minR);
    points.push([around[0] + Math.sin(angle) * distance, around[1] + Math.cos(angle) * distance]);
  }
  return { points, rng: seed };
}

/**
 * Advances {@link HeatState} by one tick: sums this tick's witnessed gains, bleeds heat once clear of
 * witnesses past `decayDelaySeconds`, resolves the current {@link HeatLevelDef}, and reports how many
 * pursuers to spawn (with ring points) or whether to stand pursuit down entirely.
  * @internal
  */
export function advanceHeat(
  config: HeatConfig,
  state: HeatState,
  dt: number,
  gains: readonly HeatGain[],
  ctx: HeatTickContext,
): HeatStep {
  const maxHeat = config.maxHeat ?? Number.POSITIVE_INFINITY;
  const decayDelay = config.decayDelaySeconds ?? 0;
  const gained = gains.reduce((sum, gain) => (gain.witnessed ? sum + gain.amount : sum), 0);

  let heat = state.heat;
  let sinceGain = state.sinceGain;
  if (gained > 0) {
    heat = Math.min(maxHeat, heat + gained);
    sinceGain = 0;
  } else {
    sinceGain += dt;
    if (sinceGain >= decayDelay && !ctx.nearWitness) {
      heat = Math.max(0, heat - config.decayPerSecond * dt);
    }
  }

  const resolvedLevel = levelFor(config.levels, heat);
  const level = resolvedLevel?.level ?? 0;
  const pursuerBudget = resolvedLevel?.pursuerBudget ?? 0;
  const levelChanged = level !== state.level;

  let standDownElapsed = state.standDownElapsed;
  let standDown = false;
  if (level === 0 && ctx.activePursuers > 0) {
    standDownElapsed += dt;
    const limit = config.standDownSeconds ?? 0;
    if (standDownElapsed >= limit) {
      standDown = true;
      standDownElapsed = 0;
    }
  } else {
    standDownElapsed = 0;
  }

  const wantSpawns = Math.max(0, pursuerBudget - ctx.activePursuers);
  let spawnPoints: HeatPoint[] = [];
  let rng = state.rng;
  if (wantSpawns > 0 && config.spawnRingRadius !== undefined) {
    const rolled = ringPoints(ctx.around, wantSpawns, config.spawnRingRadius, rng);
    spawnPoints = rolled.points;
    rng = rolled.rng;
  }

  return {
    state: { heat, level, sinceGain, standDownElapsed, rng },
    levelChanged,
    pursuerBudget,
    wantSpawns,
    spawnPoints,
    standDown,
  };
}

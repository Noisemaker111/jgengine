import type { NavPoint } from "../nav/navGrid";
import { randomSeedFrom, stepRandomSeed, type RandomSeed } from "../random/rng";

export interface SpawnEntry {
  id: string;
  cost: number;
  weight?: number;
  minWave?: number;
}

export interface WaveManifest {
  budget: number;
  entries: readonly SpawnEntry[];
  duration?: number;
  budgetPerSecond?: number;
}

export interface SpawnDirectorConfig {
  waves: readonly WaveManifest[];
  maxAlive?: number;
  escalationPerSecond?: number;
  alertBudgetPerSecond?: number;
  alertDecayPerSecond?: number;
  playerBudgetPerSecond?: number;
  maxSpawnsPerTick?: number;
  loop?: boolean;
  seed?: number;
  spawnPoints?: readonly NavPoint[];
  spawnPointBias?: number;
}

export interface SpawnDirectorState {
  wave: number;
  elapsed: number;
  waveElapsed: number;
  budget: number;
  alert: number;
  spawnedThisWave: number;
  spawnedTotal: number;
  /** Opaque PRNG cursor — round-trip it as part of the state, never read or set it directly. */
  rng: RandomSeed;
  done: boolean;
}

export interface DirectorContext {
  alive: number;
  players?: number;
  playerPositions?: readonly NavPoint[];
}

export interface SpawnRequest {
  entryId: string;
  cost: number;
  wave: number;
  point?: NavPoint;
  laneId?: number;
}

/** Preference for picking a spawn point relative to `avoid` positions: closer, farther, or unweighted. */
export type SpawnPointDistanceBias = "near" | "far" | "none";

/** How strongly `distanceBias` weights candidates by distance from `avoid` — a named intent, not a weighting exponent. */
export type SpawnPointBiasStrength = "subtle" | "moderate" | "strong";

const BIAS_STRENGTH_EXPONENT: Record<SpawnPointBiasStrength, number> = {
  subtle: 0.5,
  moderate: 1,
  strong: 2,
};

function biasStrengthFromMagnitude(magnitude: number): SpawnPointBiasStrength {
  return magnitude <= 0.5 ? "subtle" : magnitude >= 1.5 ? "strong" : "moderate";
}

/** Semantic options for selecting a spawn point without exposing weighting internals. */
export interface SpawnPointSelectionOptions {
  candidates: readonly NavPoint[];
  avoid?: readonly NavPoint[];
  random: () => number;
  distanceBias?: SpawnPointDistanceBias;
  /** Default `"moderate"`. */
  biasStrength?: SpawnPointBiasStrength;
}

export interface DirectorStep {
  state: SpawnDirectorState;
  spawns: SpawnRequest[];
}

const DEFAULT_MAX_SPAWNS_PER_TICK = 64;
const DEFAULT_ALERT_DECAY = 0.1;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function createSpawnDirectorState(config: SpawnDirectorConfig): SpawnDirectorState {
  const first = config.waves[0];
  return {
    wave: 0,
    elapsed: 0,
    waveElapsed: 0,
    budget: first?.budget ?? 0,
    alert: 0,
    spawnedThisWave: 0,
    spawnedTotal: 0,
    rng: randomSeedFrom(config.seed ?? 1),
    done: config.waves.length === 0,
  };
}

export function raiseAlert(state: SpawnDirectorState, amount: number): SpawnDirectorState {
  return { ...state, alert: clamp01(state.alert + amount) };
}

export function advanceWave(config: SpawnDirectorConfig, state: SpawnDirectorState): SpawnDirectorState {
  const loop = config.loop ?? false;
  const lastIndex = config.waves.length - 1;
  if (state.wave >= lastIndex && !loop) return { ...state, done: true };
  const nextWave = state.wave >= lastIndex ? 0 : state.wave + 1;
  const manifest = config.waves[nextWave]!;
  return {
    ...state,
    wave: nextWave,
    waveElapsed: 0,
    spawnedThisWave: 0,
    budget: state.budget + manifest.budget,
    done: false,
  };
}

function pickEntry(
  entries: readonly SpawnEntry[],
  wave: number,
  budget: number,
  rng: RandomSeed,
): { entry: SpawnEntry; rng: RandomSeed } | null {
  let total = 0;
  const affordable: SpawnEntry[] = [];
  for (const entry of entries) {
    if (entry.cost > budget) continue;
    if ((entry.minWave ?? 0) > wave) continue;
    affordable.push(entry);
    total += entry.weight ?? 1;
  }
  if (affordable.length === 0 || total <= 0) return null;
  const [roll, nextRng] = stepRandomSeed(rng);
  let cursor = roll * total;
  for (const entry of affordable) {
    cursor -= entry.weight ?? 1;
    if (cursor <= 0) return { entry, rng: nextRng };
  }
  return { entry: affordable[affordable.length - 1]!, rng: nextRng };
}

export function advanceSpawnDirector(
  config: SpawnDirectorConfig,
  state: SpawnDirectorState,
  dt: number,
  ctx: DirectorContext,
): DirectorStep {
  if (state.done || dt <= 0) return { state, spawns: [] };

  const maxAlive = config.maxAlive ?? Number.POSITIVE_INFINITY;
  const maxSpawns = config.maxSpawnsPerTick ?? DEFAULT_MAX_SPAWNS_PER_TICK;
  const alertDecay = config.alertDecayPerSecond ?? DEFAULT_ALERT_DECAY;
  const players = ctx.players ?? 0;

  let wave = state.wave;
  let elapsed = state.elapsed + dt;
  let waveElapsed = state.waveElapsed + dt;
  let budget = state.budget;
  let spawnedThisWave = state.spawnedThisWave;
  let done: boolean = state.done;
  const alert = Math.max(0, state.alert - alertDecay * dt);

  const trickle = config.waves[wave]?.budgetPerSecond ?? 0;
  const escalation = config.escalationPerSecond ?? 0;
  const alertBonus = (config.alertBudgetPerSecond ?? 0) * alert;
  const playerBonus = (config.playerBudgetPerSecond ?? 0) * players;
  budget += (trickle + escalation + alertBonus + playerBonus) * dt;

  const lastIndex = config.waves.length - 1;
  const loop = config.loop ?? false;
  let guard = config.waves.length + 1;
  while (guard > 0) {
    guard -= 1;
    const manifest = config.waves[wave];
    if (manifest?.duration === undefined || waveElapsed < manifest.duration) break;
    if (wave >= lastIndex && !loop) {
      done = true;
      break;
    }
    waveElapsed -= manifest.duration;
    wave = wave >= lastIndex ? 0 : wave + 1;
    spawnedThisWave = 0;
    budget += config.waves[wave]!.budget;
  }

  const spawns: SpawnRequest[] = [];
  let rng = state.rng;
  let spawnedTotal = state.spawnedTotal;
  let alive = ctx.alive;
  const entries = config.waves[wave]?.entries ?? [];
  const spawnPoints = config.spawnPoints;
  const playerPositions = ctx.playerPositions ?? [];
  while (spawns.length < maxSpawns && alive < maxAlive) {
    const picked = pickEntry(entries, wave, budget, rng);
    if (picked === null) break;
    rng = picked.rng;
    budget -= picked.entry.cost;
    const spawn: SpawnRequest = { entryId: picked.entry.id, cost: picked.entry.cost, wave };
    if (spawnPoints !== undefined && spawnPoints.length > 0) {
      const [roll, nextRng] = stepRandomSeed(rng);
      rng = nextRng;
      const bias = config.spawnPointBias ?? 1;
      const point = pickSpawnPoint({
        candidates: spawnPoints,
        avoid: playerPositions,
        random: () => roll,
        distanceBias: bias < 0 ? "far" : bias > 0 ? "near" : "none",
        biasStrength: biasStrengthFromMagnitude(Math.abs(bias)),
      });
      if (point !== null) {
        spawn.point = point;
        spawn.laneId = spawnPoints.indexOf(point);
      }
    }
    spawns.push(spawn);
    spawnedThisWave += 1;
    spawnedTotal += 1;
    alive += 1;
  }

  return {
    state: { wave, elapsed, waveElapsed, budget, alert, spawnedThisWave, spawnedTotal, rng, done },
    spawns,
  };
}

/** Selects a candidate spawn point using a semantic distance preference and caller-supplied randomness. */
export function pickSpawnPoint(options: SpawnPointSelectionOptions): NavPoint | null;
/** @deprecated Pass one SpawnPointSelectionOptions object instead. */
export function pickSpawnPoint(
  points: readonly NavPoint[],
  players: readonly NavPoint[],
  options: { roll: number; bias?: number },
): NavPoint | null;
export function pickSpawnPoint(
  optionsOrPoints: SpawnPointSelectionOptions | readonly NavPoint[],
  legacyPlayers: readonly NavPoint[] = [],
  legacyOptions: { roll: number; bias?: number } = { roll: 0 },
): NavPoint | null {
  let options: SpawnPointSelectionOptions;
  if (Array.isArray(optionsOrPoints)) {
    const legacyBias = legacyOptions.bias ?? 1;
    options = {
      candidates: optionsOrPoints as readonly NavPoint[],
      avoid: legacyPlayers,
      random: () => legacyOptions.roll,
      distanceBias: legacyBias < 0 ? "far" : legacyBias > 0 ? "near" : "none",
      biasStrength: biasStrengthFromMagnitude(Math.abs(legacyBias)),
    };
  } else {
    options = optionsOrPoints as SpawnPointSelectionOptions;
  }
  const { candidates, avoid = [], random, distanceBias = "near", biasStrength = "moderate" } = options;
  if (candidates.length === 0) return null;
  if (distanceBias === "none" || avoid.length === 0) {
    return candidates[Math.min(candidates.length - 1, Math.floor(clamp01(random()) * candidates.length))]!;
  }

  const strength = BIAS_STRENGTH_EXPONENT[biasStrength];
  const exponent = distanceBias === "far" ? strength : -strength;
  const weights: number[] = [];
  let total = 0;
  for (const point of candidates) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const avoidedPoint of avoid) {
      const distance = Math.hypot(point[0] - avoidedPoint[0], point[1] - avoidedPoint[1]);
      if (distance < nearest) nearest = distance;
    }
    const weight = Math.max(1e-6, (1 + nearest) ** exponent);
    weights.push(weight);
    total += weight;
  }

  let cursor = clamp01(random()) * total;
  for (let index = 0; index < candidates.length; index += 1) {
    cursor -= weights[index]!;
    if (cursor <= 0) return candidates[index]!;
  }
  return candidates[candidates.length - 1]!;
}

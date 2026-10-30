import type { NavPoint } from "../nav/navGrid";
import { randomSeedFrom, stepRandomSeed, type RandomSeed } from "../random/rng";
import { distanceBiasStrength, type DistanceBias } from "../world/spatialSample";
import { selectSpawnPoint } from "./spawnPoint";

/** One kind a wave can spend budget on: its cost, pick weight and the first wave it may appear in. */
export interface SpawnEntry {
  id: string;
  cost: number;
  weight?: number;
  minWave?: number;
}

/** One wave: the budget it opens with, the kinds it may buy, and how long it runs or how fast it refills. */
export interface WaveManifest {
  budget: number;
  entries: readonly SpawnEntry[];
  duration?: number;
  budgetPerSecond?: number;
}

/** The whole wave plan plus the pacing knobs: alive cap, escalation, alert and per-player budget, looping and spawn points. */
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

/** Where the director is: current wave, clocks, spare budget, alert level and spawn counts. Serializable. */
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

/** What the director reads from the world each step: how many are alive and where the players are. */
export interface DirectorContext {
  alive: number;
  players?: number;
  playerPositions?: readonly NavPoint[];
}

/** One spawn the caller should perform: which entry, what it cost, which wave, and where. */
export interface SpawnRequest {
  entryId: string;
  cost: number;
  wave: number;
  point?: NavPoint;
  laneId?: number;
}

/** One director step: the next state and the spawns to perform. */
export interface DirectorStep {
  state: SpawnDirectorState;
  spawns: SpawnRequest[];
}

const DEFAULT_MAX_SPAWNS_PER_TICK = 64;
const DEFAULT_ALERT_DECAY = 0.1;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** The semantic distance preference a signed `spawnPointBias` names. */
function distanceBiasOf(bias: number): DistanceBias {
  return bias < 0 ? "far" : bias > 0 ? "near" : "none";
}

/** A fresh director at the first wave with that wave's budget. */
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

/** Raise the alert level (clamped to 0..1), which adds budget while it decays. */
export function raiseAlert(state: SpawnDirectorState, amount: number): SpawnDirectorState {
  return { ...state, alert: clamp01(state.alert + amount) };
}

/** Move to the next wave (or loop, or finish), resetting the wave clock and budget. */
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

/** Advance the director by `dt` seconds: earn budget, spend it on spawns under the alive cap, and roll waves over. */
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
      const point = selectSpawnPoint({
        candidates: spawnPoints,
        avoid: playerPositions,
        random: () => roll,
        distanceBias: distanceBiasOf(bias),
        biasStrength: distanceBiasStrength(Math.abs(bias)),
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


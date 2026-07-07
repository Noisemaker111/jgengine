import type { NavPoint } from "../nav/navGrid";

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
}

export interface SpawnDirectorState {
  wave: number;
  elapsed: number;
  waveElapsed: number;
  budget: number;
  alert: number;
  spawnedThisWave: number;
  spawnedTotal: number;
  rng: number;
  done: boolean;
}

export interface DirectorContext {
  alive: number;
  players?: number;
}

export interface SpawnRequest {
  entryId: string;
  cost: number;
  wave: number;
}

export interface DirectorStep {
  state: SpawnDirectorState;
  spawns: SpawnRequest[];
}

const DEFAULT_MAX_SPAWNS_PER_TICK = 64;
const DEFAULT_ALERT_DECAY = 0.1;

function nextRandom(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

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
    rng: (config.seed ?? 1) | 0,
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
  rng: number,
): { entry: SpawnEntry; rng: number } | null {
  let total = 0;
  const affordable: SpawnEntry[] = [];
  for (const entry of entries) {
    if (entry.cost > budget) continue;
    if ((entry.minWave ?? 0) > wave) continue;
    affordable.push(entry);
    total += entry.weight ?? 1;
  }
  if (affordable.length === 0 || total <= 0) return null;
  const [roll, nextRng] = nextRandom(rng);
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
  const escalation = (config.escalationPerSecond ?? 0) * elapsed;
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
  while (spawns.length < maxSpawns && alive < maxAlive) {
    const picked = pickEntry(entries, wave, budget, rng);
    if (picked === null) break;
    rng = picked.rng;
    budget -= picked.entry.cost;
    spawns.push({ entryId: picked.entry.id, cost: picked.entry.cost, wave });
    spawnedThisWave += 1;
    spawnedTotal += 1;
    alive += 1;
  }

  return {
    state: { wave, elapsed, waveElapsed, budget, alert, spawnedThisWave, spawnedTotal, rng, done },
    spawns,
  };
}

export function pickSpawnPoint(
  points: readonly NavPoint[],
  players: readonly NavPoint[],
  options: { roll: number; bias?: number },
): NavPoint | null {
  if (points.length === 0) return null;
  const bias = options.bias ?? 1;
  const weights: number[] = [];
  let total = 0;
  for (const point of points) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const player of players) {
      const d = Math.hypot(point[0] - player[0], point[1] - player[1]);
      if (d < nearest) nearest = d;
    }
    const distance = nearest === Number.POSITIVE_INFINITY ? 0 : nearest;
    const weight = Math.max(1e-6, (1 + distance) ** -bias);
    weights.push(weight);
    total += weight;
  }
  let cursor = clamp01(options.roll) * total;
  for (let i = 0; i < points.length; i += 1) {
    cursor -= weights[i]!;
    if (cursor <= 0) return points[i]!;
  }
  return points[points.length - 1]!;
}

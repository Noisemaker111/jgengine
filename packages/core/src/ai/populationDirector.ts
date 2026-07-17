import type { NavPoint } from "../nav/navGrid";
import { randomSeedFrom, stepRandomSeed, type RandomSeed } from "../random/rng";

/** One species that ambiently populates a region: how heavily it is favoured and its alive ceiling. */
export interface PopulationSpeciesEntry {
  /** Opaque species/creature id the engine never interprets. */
  species: string;
  /** Relative pick weight among species below their cap (default 1). */
  weight?: number;
  /** Target/maximum number of this species alive in the region at once. */
  cap: number;
}

/** Ambient population budget for a single region: its species ceilings, refill timing, and spawn geometry. */
export interface PopulationRegionConfig {
  /** Opaque region id the engine never interprets. */
  region: string;
  species: readonly PopulationSpeciesEntry[];
  /** Seconds a freed slot waits before it becomes a spawn candidate (overrides the director default). */
  respawnDelay?: number;
  /** Candidate spawn locations; when present each request is tagged with one. */
  spawnPoints?: readonly NavPoint[];
}

/** Full ambient-population configuration: per-region species budgets plus global refill limits and PRNG seed. */
export interface PopulationDirectorConfig {
  regions: readonly PopulationRegionConfig[];
  /** Default respawn delay in game-seconds for regions without their own (default 0 — refill on the next tick). */
  respawnDelay?: number;
  /** Upper bound on spawn requests emitted per {@link PopulationDirector.tick} call (default 32). */
  maxSpawnsPerTick?: number;
  /** Seed for the persisted, serializable PRNG cursor (default 1). */
  seed?: number;
}

/** A single ambient spawn the game should realise, refilling a region toward its species caps. */
export interface PopulationSpawnRequest {
  region: string;
  species: string;
  /** Chosen spawn location when the region declares `spawnPoints`. */
  point?: NavPoint;
}

/** Per-call spawn-point selection hook, letting a game apply bias (distance from players, etc.) at tick time. */
export interface PopulationTickContext {
  /**
   * Choose a spawn point for a request. Receives the region id, its configured candidates, and a
   * deterministic roll in `[0, 1)` drawn from the persisted cursor. Return `null` to leave the
   * request unplaced. When omitted, a candidate is picked uniformly from the roll.
   */
  pickSpawnPoint?(region: string, candidates: readonly NavPoint[], roll: number): NavPoint | null;
}

/** Live census of alive counts keyed `region -> species -> count`, used to reconcile the director to reality. */
export type PopulationCensus = Record<string, Record<string, number>>;

/**
 * A queued refill slot awaiting its {@link PopulationDirectorState.elapsed} deadline.
 * @internal
 */
export interface PopulationRespawnSlot {
  region: string;
  readyAt: number;
}

/**
 * Opaque, JSON-serializable persistence for a {@link PopulationDirector}. Round-trip it through
 * `snapshot`/`hydrate`; never read or mutate the fields directly.
 */
export interface PopulationDirectorState {
  /** Accumulated game-seconds. */
  elapsed: number;
  /** Believed alive counts, `region -> species -> count`. */
  alive: Record<string, Record<string, number>>;
  /** Pending refill slots, each ready at its `readyAt` game-second. */
  queue: readonly PopulationRespawnSlot[];
  /** Opaque PRNG cursor — round-trip as part of the state, never read or set it directly. */
  rng: RandomSeed;
}

/** Stateful ambient population manager for one world; drive it with `tick` and lifecycle notifications. */
export interface PopulationDirector {
  /**
   * Advance by `dt` game-seconds and emit spawn requests for refill slots whose delay has elapsed,
   * up to the per-tick cap. Only touches the bounded respawn queue — never scans the world.
   */
  tick(dt: number, ctx?: PopulationTickContext): PopulationSpawnRequest[];
  /** Register that a creature left the region (killed/despawned/tamed), freeing a slot to refill after the delay. */
  notifyRemoved(region: string, species: string, id?: string): void;
  /** Register a creature the game introduced itself (not via a request), so caps account for it. */
  notifySpawned(region: string, species: string, id?: string): void;
  /** Snap believed alive counts to a live census and re-queue any deficit toward the caps. */
  reconcile(census: PopulationCensus): void;
  /** Believed alive count for a `(region, species)` pair. */
  alive(region: string, species: string): number;
  /** Serializable copy of the full director state (deep, safe to persist). */
  snapshot(): PopulationDirectorState;
  /** Replace the director state from a previously taken (and possibly JSON round-tripped) snapshot. */
  hydrate(state: PopulationDirectorState): void;
}

const DEFAULT_MAX_SPAWNS_PER_TICK = 32;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function cloneState(state: PopulationDirectorState): PopulationDirectorState {
  const alive: Record<string, Record<string, number>> = {};
  for (const region of Object.keys(state.alive)) alive[region] = { ...state.alive[region] };
  return {
    elapsed: state.elapsed,
    alive,
    queue: state.queue.map((slot) => ({ region: slot.region, readyAt: slot.readyAt })),
    rng: state.rng,
  };
}

/**
 * Ambient open-world population director. Holds a target creature population per region and refills
 * it over time, distinct from wave/horde spawning: instead of a budget draining down a wave, each
 * region has per-species caps and a timed respawn queue. Removing a creature frees a slot; after a
 * respawn delay `tick` emits weighted spawn requests (bounded per tick) that refill toward the caps
 * without ever exceeding them. Species are chosen through a persisted, serializable {@link RandomSeed}
 * cursor, so the same seed and the same lifecycle events always yield the same requests. Regions are
 * independent, spawn points are optional, and the whole state round-trips through `snapshot`/`hydrate`.
 *
 * @capability population-director ambient per-region creature population manager with timed weighted respawns and caps
 */
export function createPopulationDirector(config: PopulationDirectorConfig): PopulationDirector {
  const regions = new Map<string, PopulationRegionConfig>();
  for (const region of config.regions) regions.set(region.region, region);
  const maxSpawnsPerTick = config.maxSpawnsPerTick ?? DEFAULT_MAX_SPAWNS_PER_TICK;
  const defaultDelay = config.respawnDelay ?? 0;

  let state: PopulationDirectorState = {
    elapsed: 0,
    alive: {},
    queue: [],
    rng: randomSeedFrom(config.seed ?? 1),
  };

  const totalCap = (region: PopulationRegionConfig): number => {
    let sum = 0;
    for (const entry of region.species) sum += entry.cap;
    return sum;
  };

  const totalAlive = (regionId: string): number => {
    const counts = state.alive[regionId];
    if (counts === undefined) return 0;
    let sum = 0;
    for (const key of Object.keys(counts)) sum += counts[key]!;
    return sum;
  };

  const queuedCount = (regionId: string): number => {
    let sum = 0;
    for (const slot of state.queue) if (slot.region === regionId) sum += 1;
    return sum;
  };

  const delayFor = (region: PopulationRegionConfig): number => region.respawnDelay ?? defaultDelay;

  const aliveFor = (regionId: string): Record<string, number> => {
    let counts = state.alive[regionId];
    if (counts === undefined) {
      counts = {};
      state.alive[regionId] = counts;
    }
    return counts;
  };

  /** Top up the queue so `alive + queued` reaches the region cap, appending ready-at slots. */
  const ensureDeficitQueued = (region: PopulationRegionConfig, readyAt: number): void => {
    const deficit = totalCap(region) - totalAlive(region.region) - queuedCount(region.region);
    if (deficit <= 0) return;
    const next = state.queue.slice();
    for (let i = 0; i < deficit; i += 1) next.push({ region: region.region, readyAt });
    state.queue = next;
  };

  // Prime each region to fill toward its caps on the first ticks.
  for (const region of config.regions) {
    aliveFor(region.region);
    ensureDeficitQueued(region, 0);
  }

  const pickSpecies = (region: PopulationRegionConfig): string | null => {
    const counts = state.alive[region.region] ?? {};
    let total = 0;
    const eligible: PopulationSpeciesEntry[] = [];
    for (const entry of region.species) {
      if ((counts[entry.species] ?? 0) >= entry.cap) continue;
      eligible.push(entry);
      total += entry.weight ?? 1;
    }
    if (eligible.length === 0 || total <= 0) return null;
    const [roll, nextRng] = stepRandomSeed(state.rng);
    state.rng = nextRng;
    let cursor = roll * total;
    for (const entry of eligible) {
      cursor -= entry.weight ?? 1;
      if (cursor <= 0) return entry.species;
    }
    return eligible[eligible.length - 1]!.species;
  };

  const choosePoint = (
    region: PopulationRegionConfig,
    ctx: PopulationTickContext | undefined,
  ): NavPoint | undefined => {
    const points = region.spawnPoints;
    if (points === undefined || points.length === 0) return undefined;
    const [roll, nextRng] = stepRandomSeed(state.rng);
    state.rng = nextRng;
    if (ctx?.pickSpawnPoint !== undefined) {
      const chosen = ctx.pickSpawnPoint(region.region, points, roll);
      return chosen ?? undefined;
    }
    return points[Math.min(points.length - 1, Math.floor(clamp01(roll) * points.length))]!;
  };

  return {
    tick(dt, ctx) {
      if (dt <= 0) return [];
      state.elapsed += dt;
      const now = state.elapsed;
      const requests: PopulationSpawnRequest[] = [];
      const remaining: PopulationRespawnSlot[] = [];
      for (const slot of state.queue) {
        if (requests.length >= maxSpawnsPerTick || slot.readyAt > now) {
          remaining.push(slot);
          continue;
        }
        const region = regions.get(slot.region);
        if (region === undefined) continue; // region no longer configured — drop the slot
        const species = pickSpecies(region);
        if (species === null) continue; // region already at cap (filled externally) — drop the slot
        aliveFor(region.region)[species] = (state.alive[region.region]![species] ?? 0) + 1;
        const request: PopulationSpawnRequest = { region: region.region, species };
        const point = choosePoint(region, ctx);
        if (point !== undefined) request.point = point;
        requests.push(request);
      }
      state.queue = remaining;
      return requests;
    },

    notifyRemoved(region, species, _id) {
      const counts = state.alive[region];
      if (counts !== undefined) {
        const current = counts[species] ?? 0;
        if (current > 0) counts[species] = current - 1;
      }
      const regionConfig = regions.get(region);
      if (regionConfig === undefined) return;
      const next = state.queue.slice();
      next.push({ region, readyAt: state.elapsed + delayFor(regionConfig) });
      state.queue = next;
    },

    notifySpawned(region, species, _id) {
      if (!regions.has(region)) return;
      const counts = aliveFor(region);
      counts[species] = (counts[species] ?? 0) + 1;
    },

    reconcile(census) {
      for (const region of config.regions) {
        const observed = census[region.region] ?? {};
        const counts: Record<string, number> = {};
        for (const entry of region.species) counts[entry.species] = observed[entry.species] ?? 0;
        state.alive[region.region] = counts;
      }
      for (const region of config.regions) ensureDeficitQueued(region, state.elapsed);
    },

    alive(region, species) {
      return state.alive[region]?.[species] ?? 0;
    },

    snapshot() {
      return cloneState(state);
    },

    hydrate(next) {
      state = cloneState(next);
    },
  };
}

import {
  advanceSpawnDirector,
  advanceWave,
  createSpawnDirectorState,
  raiseAlert as raiseDirectorAlert,
  type DirectorContext,
  type SpawnDirectorConfig,
  type SpawnDirectorState,
  type SpawnRequest,
} from "./spawnDirector";

/**
 * A callback the wave runner hands each {@link SpawnRequest} the underlying spawn
 * director emits. The runner never instantiates entities itself — it forwards the
 * request (a free-string `entryId` "kind", cost, wave, optional point/lane) to the
 * game, which decides what to build. Keeps the runner genre-agnostic.
 */
export type WaveSpawnSink = (request: SpawnRequest) => void;

/**
 * Configuration for {@link createWaveRunner}: the full {@link SpawnDirectorConfig}
 * (escalating waves, budgets, seed, spawn points) plus an optional {@link WaveSpawnSink}.
 * The runner owns the director state — you never pass a `SpawnDirectorState` here.
 */
export interface WaveRunnerConfig extends SpawnDirectorConfig {
  /** Optional sink invoked once per spawned {@link SpawnRequest} during {@link WaveRunner.update}. */
  onSpawn?: WaveSpawnSink;
}

/**
 * A pooled, per-frame readout of the current wave — the "brain behind WAVE 3".
 * Reused across {@link WaveRunner.view} calls (never per-frame allocated), so read
 * it and render it, don't retain it.
 */
export interface WaveView {
  /** 1-based wave number for display ("WAVE N"). The 0-based index lives on {@link WaveRunner.state}. */
  wave: number;
  /**
   * Progress `0..1` through the current wave: `waveElapsed / duration` when the
   * wave declares a `duration`, otherwise a budget-drain estimate (`1 - budget /
   * waveBudget`). A best-effort readout for a progress bar, not an exact schedule.
   */
  waveProgress: number;
  /** Spawn budget currently banked in the director. */
  budget: number;
  /** How many entities have spawned during the current wave. */
  spawnedThisWave: number;
  /** How many entities have spawned across every wave so far. */
  spawnedTotal: number;
  /** Current alert level `0..1` (raised by {@link WaveRunner.raiseAlert}, decays over time). */
  alert: number;
  /** True once the final non-looping wave has finished. */
  done: boolean;
}

/** A live, observable, serializable wave/spawn runner over a seeded spawn director. */
export interface WaveRunner {
  /**
   * Advance the director by `dt` seconds: bank budget, roll escalation/alert, cross
   * wave boundaries, and forward every emitted {@link SpawnRequest} to the configured
   * `onSpawn` sink. Pass a {@link DirectorContext} (defaults to `{ alive: 0 }`) to feed
   * back the live alive-count / player positions. Notifies subscribers on change.
   */
  update(dt: number, ctx?: DirectorContext): void;
  /** The pooled current-wave readout to render (do not retain). */
  view(): WaveView;
  /** Force an immediate jump to the next wave (delegates to `advanceWave`). Notifies. */
  forceNextWave(): void;
  /** Raise the alert level by `amount` (clamped `0..1`), boosting spawn budget. Notifies. */
  raiseAlert(amount: number): void;
  /** The raw underlying {@link SpawnDirectorState} (0-based `wave`); read-only snapshot of internals. */
  state(): SpawnDirectorState;
  /** Observe changes (update, forceNextWave, raiseAlert, restore). Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** Serializable state for a save — the plain {@link SpawnDirectorState} object. */
  snapshot(): SpawnDirectorState;
  /** Restore from a {@link snapshot} (a plain {@link SpawnDirectorState}). Notifies. */
  restore(snapshot: SpawnDirectorState): void;
}

const DEFAULT_CONTEXT: DirectorContext = { alive: 0 };

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * A thin, stateful, observable wrapper around the seeded {@link createSpawnDirectorState}
 * / {@link advanceSpawnDirector} model. It OWNS a {@link SpawnDirectorState}, ticks it
 * from `update(dt, ctx?)`, keeps the new state, and forwards each emitted
 * {@link SpawnRequest} to an optional `onSpawn` sink so the model never instantiates
 * entities. `view()` returns a pooled per-frame readout — the "brain behind WAVE 3":
 * the 1-based wave number, wave progress `0..1`, banked budget, per-wave and total
 * spawn counts, alert, and done flag. `forceNextWave` / `raiseAlert` drive it,
 * `subscribe` observes it, and `snapshot`/`restore` round-trip the plain serializable
 * state object through a save. Nothing here is genre-specific: spawn-entry `kind`s
 * (the director's `entryId`s) stay free strings the runner never interprets.
 *
 * @capability wave-runner observable serializable wave/spawn runner over the seeded spawn director — WAVE N, wave progress, budget/alert readout, onSpawn sink, snapshot/restore
 */
export function createWaveRunner(config: WaveRunnerConfig): WaveRunner {
  const onSpawn = config.onSpawn;
  let state = createSpawnDirectorState(config);
  const listeners = new Set<() => void>();
  // Pooled readout — reused across view() calls, never per-frame allocated.
  const readout: WaveView = {
    wave: 1,
    waveProgress: 0,
    budget: 0,
    spawnedThisWave: 0,
    spawnedTotal: 0,
    alert: 0,
    done: false,
  };

  function notify(): void {
    for (const listener of listeners) listener();
  }

  /** True if any field a HUD cares about differs between two states. */
  function changed(a: SpawnDirectorState, b: SpawnDirectorState): boolean {
    return (
      a.wave !== b.wave ||
      a.budget !== b.budget ||
      a.spawnedThisWave !== b.spawnedThisWave ||
      a.spawnedTotal !== b.spawnedTotal ||
      a.alert !== b.alert ||
      a.done !== b.done
    );
  }

  function waveProgress(): number {
    const manifest = config.waves[state.wave];
    if (manifest === undefined) return state.done ? 1 : 0;
    if (manifest.duration !== undefined && manifest.duration > 0) {
      return clamp01(state.waveElapsed / manifest.duration);
    }
    if (manifest.budget > 0) {
      return clamp01(1 - state.budget / manifest.budget);
    }
    return state.done ? 1 : 0;
  }

  return {
    update(dt, ctx = DEFAULT_CONTEXT) {
      const previous = state;
      const step = advanceSpawnDirector(config, state, dt, ctx);
      state = step.state;
      if (onSpawn !== undefined) {
        for (const spawn of step.spawns) onSpawn(spawn);
      }
      if (step.spawns.length > 0 || changed(previous, state)) notify();
    },
    view() {
      readout.wave = state.wave + 1;
      readout.waveProgress = waveProgress();
      readout.budget = state.budget;
      readout.spawnedThisWave = state.spawnedThisWave;
      readout.spawnedTotal = state.spawnedTotal;
      readout.alert = state.alert;
      readout.done = state.done;
      return readout;
    },
    forceNextWave() {
      state = advanceWave(config, state);
      notify();
    },
    raiseAlert(amount) {
      state = raiseDirectorAlert(state, amount);
      notify();
    },
    state() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return state;
    },
    restore(snapshot) {
      state = snapshot;
      notify();
    },
  };
}

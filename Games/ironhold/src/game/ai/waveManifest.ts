import { createSpawnDirectorState, type SpawnDirectorConfig, type SpawnDirectorState, type WaveManifest } from "@jgengine/core/ai/spawnDirector";

import { ENEMY_WAVE_INTERVAL } from "../tuning";

/**
 * The Marauder reinforcement cadence, expressed for the shared spawn director. The director owns one
 * job here: the beat. Every `ENEMY_WAVE_INTERVAL` seconds it emits a single **wave token**, which the
 * game (see `director.ts`) expands into the escalating grunt+Reaver composition and the formation fan.
 *
 * Why a token instead of per-unit entries: ironhold's composition is a *deterministic* escalation
 * (`waveComposition`), not a budget-weighted draw, so the exact roster is kept game-side and the
 * director drives only timing. `budget: 1` with a single `cost: 1` entry means exactly one token
 * lands per beat; `loop: true` keeps the cadence running indefinitely. The opening grace period and
 * the fielded cap are enforced game-side by freezing (not advancing) this clock — see `tickEnemyWaves`.
 */
export const WAVE_TOKEN = "wave";

const REINFORCEMENT_BEAT: WaveManifest = {
  budget: 1,
  duration: ENEMY_WAVE_INTERVAL,
  entries: [{ id: WAVE_TOKEN, cost: 1 }],
};

export const ENEMY_WAVE_DIRECTOR_CONFIG: SpawnDirectorConfig = {
  waves: [REINFORCEMENT_BEAT],
  loop: true,
  maxSpawnsPerTick: 1,
};

/** A fresh director clock for the reinforcement cadence, ready for the opening grace period. */
export function createEnemyWaveDirector(): SpawnDirectorState {
  return createSpawnDirectorState(ENEMY_WAVE_DIRECTOR_CONFIG);
}

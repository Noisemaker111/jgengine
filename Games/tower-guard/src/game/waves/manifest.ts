import type { SpawnDirectorConfig, WaveManifest } from "@jgengine/core/ai/spawnDirector";

const SCOUT = { id: "raider_scout", cost: 1 };
const GRUNT = { id: "raider_grunt", cost: 2 };
const BRUTE = { id: "raider_brute", cost: 5 };

const WAVES: readonly WaveManifest[] = [
  { budget: 0, budgetPerSecond: 1.0, duration: 20, entries: [{ ...SCOUT, weight: 3 }, { ...GRUNT, weight: 1 }] },
  { budget: 0, budgetPerSecond: 1.3, duration: 20, entries: [{ ...SCOUT, weight: 2 }, { ...GRUNT, weight: 3 }] },
  {
    budget: 0,
    budgetPerSecond: 1.5,
    duration: 22,
    entries: [{ ...SCOUT, weight: 2 }, { ...GRUNT, weight: 3 }, { ...BRUTE, weight: 1, minWave: 2 }],
  },
  {
    budget: 0,
    budgetPerSecond: 1.8,
    duration: 22,
    entries: [{ ...SCOUT, weight: 1 }, { ...GRUNT, weight: 3 }, { ...BRUTE, weight: 2 }],
  },
  { budget: 0, budgetPerSecond: 2.1, duration: 24, entries: [{ ...GRUNT, weight: 2 }, { ...BRUTE, weight: 3 }] },
  { budget: 0, budgetPerSecond: 2.5, duration: 26, entries: [{ ...GRUNT, weight: 2 }, { ...BRUTE, weight: 4 }] },
];

export const TOTAL_WAVES = WAVES.length;

export const SPAWN_DIRECTOR_CONFIG: SpawnDirectorConfig = {
  waves: WAVES,
  maxAlive: 18,
  maxSpawnsPerTick: 4,
  loop: false,
  seed: 1337,
};

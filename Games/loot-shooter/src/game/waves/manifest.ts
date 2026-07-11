import type { SpawnEntry, WaveManifest } from "@jgengine/core/ai/spawnDirector";

export const ENEMY_COSTS: Record<string, number> = {
  drone_grunt: 10,
  skitter_grunt: 8,
  husk_grunt: 25,
  spitter_grunt: 20,
  drone_veteran: 25,
  skitter_veteran: 20,
  husk_veteran: 62,
  spitter_veteran: 50,
  drone_elite: 60,
  skitter_elite: 48,
  husk_elite: 150,
  spitter_elite: 120,
  boss_warden: 400,
  boss_dreadnought: 1200,
};

function entry(id: string, weight: number): SpawnEntry {
  return { id, cost: ENEMY_COSTS[id] ?? 10, weight };
}

export const WAVES: readonly WaveManifest[] = [
  { budget: 60, entries: [entry("drone_grunt", 60), entry("skitter_grunt", 40)] },
  { budget: 100, entries: [entry("drone_grunt", 45), entry("skitter_grunt", 35), entry("spitter_grunt", 20)] },
  {
    budget: 150,
    entries: [entry("drone_grunt", 35), entry("skitter_grunt", 30), entry("spitter_grunt", 20), entry("husk_grunt", 15)],
  },
  {
    budget: 210,
    entries: [
      entry("drone_grunt", 25),
      entry("skitter_grunt", 25),
      entry("spitter_grunt", 18),
      entry("husk_grunt", 14),
      entry("drone_veteran", 12),
      entry("skitter_veteran", 6),
    ],
  },
  {
    budget: 500,
    entries: [entry("boss_warden", 100), entry("drone_grunt", 40), entry("skitter_grunt", 30)],
  },
  {
    budget: 360,
    entries: [
      entry("drone_veteran", 26),
      entry("skitter_veteran", 24),
      entry("spitter_veteran", 18),
      entry("husk_veteran", 14),
      entry("drone_grunt", 18),
    ],
  },
  {
    budget: 460,
    entries: [
      entry("drone_veteran", 24),
      entry("skitter_veteran", 20),
      entry("spitter_veteran", 18),
      entry("husk_veteran", 16),
      entry("drone_elite", 12),
      entry("skitter_elite", 10),
    ],
  },
  {
    budget: 580,
    entries: [
      entry("drone_veteran", 18),
      entry("spitter_veteran", 16),
      entry("husk_veteran", 16),
      entry("drone_elite", 18),
      entry("skitter_elite", 16),
      entry("spitter_elite", 16),
    ],
  },
  {
    budget: 720,
    entries: [
      entry("drone_elite", 24),
      entry("skitter_elite", 20),
      entry("spitter_elite", 20),
      entry("husk_elite", 20),
      entry("husk_veteran", 16),
    ],
  },
  {
    budget: 1560,
    entries: [entry("boss_dreadnought", 100), entry("drone_elite", 30), entry("spitter_elite", 20)],
  },
];

export const WAVE_COUNT = WAVES.length;
export const WAVE_CLEAR_BONUS = 50;
export const INTERMISSION_SECONDS = 8;
export const MAX_ALIVE = 22;

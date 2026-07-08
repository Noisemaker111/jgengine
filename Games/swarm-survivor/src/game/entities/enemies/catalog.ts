import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import type { SpawnDirectorConfig, WaveManifest } from "@jgengine/core/ai/spawnDirector";

export interface SwarmerDef {
  id: string;
  label: string;
  health: number;
  walkSpeed: number;
  contactDamage: number;
  contactIntervalSeconds: number;
  xpValue: number;
}

export const SWARMERS: readonly SwarmerDef[] = [
  { id: "skitterling", label: "Skitterling", health: 12, walkSpeed: 4.6, contactDamage: 5, contactIntervalSeconds: 0.6, xpValue: 1 },
  { id: "husk", label: "Husk", health: 32, walkSpeed: 3.1, contactDamage: 9, contactIntervalSeconds: 0.7, xpValue: 3 },
  { id: "bloatling", label: "Bloatling", health: 70, walkSpeed: 2.0, contactDamage: 14, contactIntervalSeconds: 0.85, xpValue: 6 },
  { id: "warden", label: "Warden", health: 260, walkSpeed: 2.5, contactDamage: 24, contactIntervalSeconds: 0.9, xpValue: 24 },
];

const SWARMER_BY_ID = new Map(SWARMERS.map((swarmer) => [swarmer.id, swarmer]));

export function swarmerDef(id: string): SwarmerDef | null {
  return SWARMER_BY_ID.get(id) ?? null;
}

export function enemyEntityCatalog(): Record<string, GameContextEntityEntry> {
  const out: Record<string, GameContextEntityEntry> = {};
  for (const swarmer of SWARMERS) {
    out[swarmer.id] = {
      role: "enemy",
      movement: { walkSpeed: swarmer.walkSpeed },
      stats: { health: { max: swarmer.health, min: 0 } },
      receive: { hit: { order: ["health"] } },
    };
  }
  return out;
}

const WAVES: readonly WaveManifest[] = [
  { budget: 10, duration: 25, entries: [{ id: "skitterling", cost: 1, weight: 6 }] },
  {
    budget: 16,
    duration: 30,
    budgetPerSecond: 0.6,
    entries: [
      { id: "skitterling", cost: 1, weight: 6 },
      { id: "husk", cost: 3, weight: 3, minWave: 1 },
    ],
  },
  {
    budget: 24,
    duration: 35,
    budgetPerSecond: 0.9,
    entries: [
      { id: "skitterling", cost: 1, weight: 5 },
      { id: "husk", cost: 3, weight: 4 },
      { id: "bloatling", cost: 6, weight: 2, minWave: 2 },
    ],
  },
  {
    budget: 36,
    duration: 40,
    budgetPerSecond: 1.2,
    entries: [
      { id: "husk", cost: 3, weight: 4 },
      { id: "bloatling", cost: 6, weight: 3 },
      { id: "warden", cost: 24, weight: 1, minWave: 3 },
    ],
  },
  {
    budget: 50,
    budgetPerSecond: 1.6,
    entries: [
      { id: "husk", cost: 3, weight: 3 },
      { id: "bloatling", cost: 6, weight: 3 },
      { id: "warden", cost: 24, weight: 2 },
    ],
  },
];

export const SPAWN_DIRECTOR_CONFIG: SpawnDirectorConfig = {
  waves: WAVES,
  maxAlive: 90,
  escalationPerSecond: 0.05,
  maxSpawnsPerTick: 12,
  seed: 1337,
};

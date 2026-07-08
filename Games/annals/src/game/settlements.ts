import { seededStreams } from "@jgengine/core/random/rng";

export const WORLD_SEED = "annals-realm-01";

const gen = seededStreams(WORLD_SEED)("settlements");

function randomInt(min: number, max: number): number {
  return Math.floor(min + gen() * (max - min + 1));
}

export type SettlementRank = "capital" | "village";

export interface Settlement {
  id: string;
  name: string;
  rank: SettlementRank;
  position: { x: number; z: number };
  population: number;
}

export const settlements: readonly Settlement[] = [
  {
    id: "vaelmere",
    name: "Vaelmere",
    rank: "capital",
    position: { x: 0, z: 20 },
    population: randomInt(3200, 5600),
  },
  {
    id: "osterholt",
    name: "Osterholt",
    rank: "village",
    position: { x: 230, z: -180 },
    population: randomInt(380, 760),
  },
  {
    id: "draywick",
    name: "Draywick",
    rank: "village",
    position: { x: -260, z: 150 },
    population: randomInt(340, 640),
  },
] as const;

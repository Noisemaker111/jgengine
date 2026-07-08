import type { AutoTargetPolicy } from "@jgengine/core/scene/autoTarget";

export interface SlowSpec {
  factor: number;
  durationMs: number;
}

export interface TowerDef {
  id: string;
  label: string;
  description: string;
  cost: number;
  range: number;
  damage: number;
  fireRateHz: number;
  splashRadius: number;
  slow?: SlowSpec;
  targeting: AutoTargetPolicy;
  boltColor: string;
  icon: "bow" | "bomb" | "frost";
  color: string;
  trim: string;
}

export const TOWER_CATALOG: Record<string, TowerDef> = {
  tower_archer: {
    id: "tower_archer",
    label: "Archer Post",
    description: "Fast single-target shots, long range.",
    cost: 50,
    range: 7,
    damage: 8,
    fireRateHz: 2,
    splashRadius: 0,
    targeting: "first",
    boltColor: "#f4d35e",
    icon: "bow",
    color: "#8a5a34",
    trim: "#4c3018",
  },
  tower_cannon: {
    id: "tower_cannon",
    label: "Cannon Redoubt",
    description: "Slow, heavy splash damage.",
    cost: 90,
    range: 5.5,
    damage: 26,
    fireRateHz: 0.7,
    splashRadius: 2.2,
    targeting: "first",
    boltColor: "#e0763a",
    icon: "bomb",
    color: "#5b5b62",
    trim: "#2c2c31",
  },
  tower_frost: {
    id: "tower_frost",
    label: "Frost Spire",
    description: "Chills raiders, slowing their advance.",
    cost: 70,
    range: 6,
    damage: 4,
    fireRateHz: 1.2,
    splashRadius: 0,
    slow: { factor: 0.45, durationMs: 1600 },
    targeting: "first",
    boltColor: "#7fd8e8",
    icon: "frost",
    color: "#3d6b82",
    trim: "#1f3b48",
  },
};

export const TOWER_IDS: readonly string[] = Object.keys(TOWER_CATALOG);

export function towerDef(id: string): TowerDef {
  const def = TOWER_CATALOG[id];
  if (def === undefined) throw new Error(`tower-guard: unknown tower id "${id}"`);
  return def;
}

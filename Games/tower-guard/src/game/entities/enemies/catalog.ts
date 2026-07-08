export interface CreepDef {
  id: string;
  label: string;
  health: number;
  speed: number;
  bounty: number;
  leak: number;
  scale: number;
  color: string;
  trim: string;
}

export const CREEP_CATALOG: Record<string, CreepDef> = {
  raider_scout: {
    id: "raider_scout",
    label: "Scout",
    health: 20,
    speed: 3.6,
    bounty: 4,
    leak: 1,
    scale: 0.75,
    color: "#c9924a",
    trim: "#7a5327",
  },
  raider_grunt: {
    id: "raider_grunt",
    label: "Grunt",
    health: 46,
    speed: 2.35,
    bounty: 6,
    leak: 1,
    scale: 1,
    color: "#8a6a9a",
    trim: "#4c3557",
  },
  raider_brute: {
    id: "raider_brute",
    label: "Brute",
    health: 150,
    speed: 1.5,
    bounty: 15,
    leak: 2,
    scale: 1.35,
    color: "#6d7d5b",
    trim: "#3a4530",
  },
};

export function creepDef(id: string): CreepDef {
  const def = CREEP_CATALOG[id];
  if (def === undefined) throw new Error(`tower-guard: unknown creep id "${id}"`);
  return def;
}

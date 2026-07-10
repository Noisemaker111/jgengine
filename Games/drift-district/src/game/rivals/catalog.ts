export interface RivalDef {
  id: string;
  entityId: string;
  name: string;
  livery: { primary: string; accent: string };
  speed: number;
  usesShortcuts: boolean;
}

export const RIVALS: readonly RivalDef[] = [
  {
    id: "ronin",
    entityId: "car_rival_ronin",
    name: "Ronin",
    livery: { primary: "#29d9e0", accent: "#0d3b3f" },
    speed: 26,
    usesShortcuts: false,
  },
  {
    id: "vega",
    entityId: "car_rival_vega",
    name: "Vega",
    livery: { primary: "#ff2d78", accent: "#4a0f28" },
    speed: 24,
    usesShortcuts: true,
  },
] as const;

export function rivalById(id: string): RivalDef {
  const found = RIVALS.find((r) => r.id === id);
  if (found === undefined) throw new Error(`rivalById: unknown rival "${id}"`);
  return found;
}

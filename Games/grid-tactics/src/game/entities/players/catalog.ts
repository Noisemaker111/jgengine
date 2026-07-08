import type { GameIconName } from "@jgengine/react/gameIcons";

export interface PlayerUnitDef {
  id: string;
  label: string;
  icon: GameIconName;
  hp: number;
  move: number;
  range: number;
  damage: number;
  pushTiles?: number;
  hull: string;
  trim: string;
}

export const PLAYER_UNITS: Record<string, PlayerUnitDef> = {
  bulwark: {
    id: "bulwark",
    label: "Bulwark",
    icon: "hammer",
    hp: 16,
    move: 3,
    range: 1,
    damage: 5,
    pushTiles: 1,
    hull: "#3b5b8c",
    trim: "#a9c4ec",
  },
  marksman: {
    id: "marksman",
    label: "Marksman",
    icon: "bow",
    hp: 10,
    move: 3,
    range: 4,
    damage: 4,
    hull: "#2f8f7c",
    trim: "#a9f0e0",
  },
  aegis: {
    id: "aegis",
    label: "Aegis",
    icon: "shield",
    hp: 20,
    move: 2,
    range: 2,
    damage: 3,
    hull: "#b98a2e",
    trim: "#ffe4a3",
  },
};

export const PLAYER_ROSTER_ORDER = ["bulwark", "marksman", "aegis"] as const;

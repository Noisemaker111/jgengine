import type { GameIconName } from "@jgengine/react/gameIcons";

export interface EnemyUnitDef {
  id: string;
  label: string;
  icon: GameIconName;
  hp: number;
  move: number;
  range: number;
  damage: number;
  hull: string;
  trim: string;
}

export const ENEMY_UNITS: Record<string, EnemyUnitDef> = {
  crawler: {
    id: "crawler",
    label: "Crawler",
    icon: "fist",
    hp: 6,
    move: 4,
    range: 1,
    damage: 3,
    hull: "#8c2f3b",
    trim: "#f2a3ac",
  },
  brute: {
    id: "brute",
    label: "Brute",
    icon: "axe",
    hp: 13,
    move: 2,
    range: 1,
    damage: 5,
    hull: "#5c2233",
    trim: "#d98a9c",
  },
  spitter: {
    id: "spitter",
    label: "Spitter",
    icon: "poison",
    hp: 5,
    move: 2,
    range: 3,
    damage: 2,
    hull: "#5b3b8c",
    trim: "#c8a9f0",
  },
};

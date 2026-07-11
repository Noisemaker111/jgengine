import { LETTER_TO_ID } from "./colors";
import { cellKey, colsInRow } from "./hex";
import type { Grid } from "./match";

export interface LevelDef {
  readonly name: string;
  readonly colors: number;
  readonly rows: readonly string[];
}

export const LEVELS: readonly LevelDef[] = [
  {
    name: "Opening Salvo",
    colors: 4,
    rows: ["RRRRRRRR", "YYYYYYY", "GGGGGGGG", "BBBBBBB"],
  },
  {
    name: "Harlequin",
    colors: 4,
    rows: ["RYRYRYRY", "GBGBGBG", "RYRYRYRY", "GBGBGBG"],
  },
  {
    name: "Keystone",
    colors: 4,
    rows: ["RRRRRRRR", "R.....R", "Y......Y", "Y.....Y", "G......G", "GBBBBBG"],
  },
  {
    name: "Prism",
    colors: 5,
    rows: ["...OO...", "..YOOY.", ".YGOOGY.", ".BGGGB.", "..BRRB..", "...RR.."],
  },
  {
    name: "Lattice",
    colors: 5,
    rows: ["ORYGBORY", "RYGBORY", "YGBORYGB", "GBORYGB", "BORYGBOR"],
  },
  {
    name: "Citadel",
    colors: 5,
    rows: ["OOOOOOOO", "O.....O", "RB....BR", "RB...BR", "GYYYYYYG", "GYYYYYG"],
  },
  {
    name: "Vortex",
    colors: 5,
    rows: ["BBBBBBBB", "BOOOOOB", "BORRRROB", "BOGYGOB", "BORRRROB", "BOOOOOB"],
  },
  {
    name: "Nebula",
    colors: 6,
    rows: ["RYGBOPRY", "YGBOPRY", "GBOPRYGB", "BOPRYGB", "OPRYGBOP", "PRYGBOP"],
  },
  {
    name: "Gauntlet",
    colors: 6,
    rows: ["PPRRYYGG", "BBOOPPR", "GGYYRRBB", "OOPPBBG", "RRGGYYPP"],
  },
  {
    name: "Last Stand",
    colors: 6,
    rows: ["PPPPPPPP", "PBBBBBP", "POOOOOOP", "PORYROP", "POGYYGOP", "PORRROP", "POOOOOOP", "PBBBBBP"],
  },
];

export const TOTAL_LEVELS = LEVELS.length;

export function parseLevel(def: LevelDef): Grid {
  const grid: Grid = new Map();
  for (let row = 0; row < def.rows.length; row += 1) {
    const line = def.rows[row]!;
    const maxCol = colsInRow(row);
    for (let col = 0; col < line.length && col < maxCol; col += 1) {
      const id = LETTER_TO_ID[line[col]!];
      if (id === undefined) continue;
      grid.set(cellKey(row, col), { row, col, color: id });
    }
  }
  return grid;
}

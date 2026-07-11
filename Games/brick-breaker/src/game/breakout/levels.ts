import { BRICK_COLS, BRICK_H, BRICK_TOP, BRICK_W, MAX_BRICK_ROWS } from "./constants";

export type BrickKind = 1 | 2 | 3 | "steel";

export interface LevelBrick {
  readonly col: number;
  readonly row: number;
  readonly kind: BrickKind;
}

export interface LevelDef {
  readonly name: string;
  readonly rows: readonly string[];
}

const CHAR_KIND: Readonly<Record<string, BrickKind | null>> = {
  ".": null,
  "1": 1,
  "2": 2,
  "3": 3,
  S: "steel",
};

export const LEVELS: readonly LevelDef[] = [
  {
    name: "First Contact",
    rows: ["111111111111", "111111111111", "111111111111", "111111111111"],
  },
  {
    name: "Checkerboard",
    rows: ["1.1.1.1.1.1.", ".2.2.2.2.2.2", "1.1.1.1.1.1.", ".2.2.2.2.2.2", "1.1.1.1.1.1."],
  },
  {
    name: "Pyramid",
    rows: [".....11.....", "....1221....", "...123321...", "..12333321..", ".1233333321."],
  },
  {
    name: "Bastion",
    rows: ["S1111111111S", ".2222222222.", ".2S2S2S2S22.", ".2222222222.", "S1111111111S"],
  },
  {
    name: "Columns",
    rows: ["2..2..2..2..", "2..2..2..2..", "3..3..3..3..", "3..3..3..3..", "2..2..2..2.."],
  },
  {
    name: "Diamond",
    rows: [
      ".....22.....",
      "....2332....",
      "...233332...",
      "..23333332..",
      ".2333333332.",
      "..23333332..",
      "...233332...",
      "....2332....",
      ".....22.....",
    ],
  },
  {
    name: "Glyph A",
    rows: ["...222222...", "..22....22..", "..22....22..", "..22222222..", "..11....11..", "..11....11.."],
  },
  {
    name: "Steel Maze",
    rows: ["1S1S1S1S1S1S", "S1S1S1S1S1S1", "1S1S1S1S1S1S", "2S2S2S2S2S2S", "S2S2S2S2S2S2"],
  },
  {
    name: "Twin Towers",
    rows: [".222....222.", ".233....332.", ".233....332.", ".222....222.", ".SSS....SSS."],
  },
  {
    name: "Waves",
    rows: ["1..11..11..1", ".11..11..11.", "1..11..11..1", ".22..22..22.", "2..22..22..2"],
  },
  {
    name: "Gauntlet",
    rows: ["333333333333", "3SS3333SS333", "333333333333", "3S33SS33S333", "322222222223"],
  },
  {
    name: "Overlord",
    rows: ["3S3S3S3S3S3S", "333333333333", "3S3S3S3S3S3S", "333333333333", "2S2S2S2S2S2S", "222222222222"],
  },
];

export const TOTAL_LEVELS = LEVELS.length;

export function isBreakable(kind: BrickKind): boolean {
  return kind !== "steel";
}

export function parseLevel(def: LevelDef): LevelBrick[] {
  const bricks: LevelBrick[] = [];
  def.rows.forEach((row, row_index) => {
    for (let col = 0; col < row.length; col += 1) {
      const kind = CHAR_KIND[row[col]!];
      if (kind === null || kind === undefined) continue;
      bricks.push({ col, row: row_index, kind });
    }
  });
  return bricks;
}

export function breakableCount(def: LevelDef): number {
  return parseLevel(def).filter((brick) => isBreakable(brick.kind)).length;
}

export function brickBounds(brick: LevelBrick): { x: number; y: number; w: number; h: number } {
  return { x: brick.col * BRICK_W, y: BRICK_TOP + brick.row * BRICK_H, w: BRICK_W, h: BRICK_H };
}

/** Returns a list of problems; an empty array means the level is valid. */
export function validateLevel(def: LevelDef): string[] {
  const problems: string[] = [];
  if (def.name.trim().length === 0) problems.push("missing name");
  if (def.rows.length === 0) problems.push("no rows");
  if (def.rows.length > MAX_BRICK_ROWS) problems.push(`too many rows (${def.rows.length})`);
  def.rows.forEach((row, index) => {
    if (row.length === 0) problems.push(`row ${index} is empty`);
    if (row.length > BRICK_COLS) problems.push(`row ${index} exceeds ${BRICK_COLS} columns`);
    for (const char of row) {
      if (!(char in CHAR_KIND)) problems.push(`row ${index} has invalid char "${char}"`);
    }
  });
  if (breakableCount(def) === 0) problems.push("no breakable bricks (steel is never required to clear)");
  return problems;
}

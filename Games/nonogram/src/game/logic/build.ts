import { colCluesOf, rowCluesOf } from "./clues";
import type { Puzzle, PuzzleSpec } from "./types";

const TEAL = "#0f766e";

export function buildPuzzle(spec: PuzzleSpec): Puzzle {
  const solution = spec.art.map((row) => Array.from(row, (ch) => ch !== "."));
  const colors = spec.art.map((row) =>
    Array.from(row, (ch) => (ch === "." ? null : (spec.palette[ch] ?? TEAL))),
  );
  return {
    id: spec.id,
    name: spec.name,
    group: spec.group,
    size: spec.size,
    solution,
    colors,
    rowClues: rowCluesOf(solution),
    colClues: colCluesOf(solution),
  };
}

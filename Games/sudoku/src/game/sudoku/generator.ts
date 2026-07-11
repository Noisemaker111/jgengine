import { seededRng } from "@jgengine/core/random/rng";

import { DIFF_CONFIG, type Difficulty } from "./difficulty";
import { CELLS } from "./grid";
import { countSolutions, generateSolvedGrid, logicalSolve, shuffle } from "./solver";

export interface GeneratedPuzzle {
  puzzle: number[];
  solution: number[];
  givens: number;
  difficulty: Difficulty;
}

/**
 * Deterministic, seeded generator: build a full solution, then dig holes in a
 * seeded random order, restoring any dig that breaks uniqueness or the
 * difficulty's technique tier. The uniqueness re-check on every dig is what
 * guarantees a single-solution puzzle.
 */
export function generatePuzzle(difficulty: Difficulty, seed: string): GeneratedPuzzle {
  const cfg = DIFF_CONFIG[difficulty];
  const solution = generateSolvedGrid(seededRng(`${seed}:solve`));
  const puzzle = solution.slice();
  const order = shuffle(
    Array.from({ length: CELLS }, (_, i) => i),
    seededRng(`${seed}:dig`),
  );

  const acceptable = (grid: number[]): boolean => {
    if (countSolutions(grid, 2) !== 1) return false;
    if (cfg.technique === "naked") return logicalSolve(grid, false).solved;
    if (cfg.technique === "hidden") return logicalSolve(grid, true).solved;
    return true;
  };

  let givens = CELLS;
  for (const i of order) {
    if (givens <= cfg.targetGivens) break;
    const saved = puzzle[i];
    if (saved === 0) continue;
    puzzle[i] = 0;
    if (acceptable(puzzle)) givens -= 1;
    else puzzle[i] = saved;
  }

  return { puzzle, solution, givens, difficulty };
}

export type SlideDir = "up" | "down" | "left" | "right";

export interface Board {
  readonly n: number;
  readonly tiles: readonly number[];
}

export function solvedTiles(n: number): number[] {
  const total = n * n;
  const tiles: number[] = [];
  for (let value = 1; value < total; value += 1) tiles.push(value);
  tiles.push(0);
  return tiles;
}

export function solvedBoard(n: number): Board {
  return { n, tiles: solvedTiles(n) };
}

export function isSolved(board: Board): boolean {
  const { n, tiles } = board;
  const total = n * n;
  for (let i = 0; i < total - 1; i += 1) {
    if (tiles[i] !== i + 1) return false;
  }
  return tiles[total - 1] === 0;
}

export function blankIndex(tiles: readonly number[]): number {
  return tiles.indexOf(0);
}

export function rowOf(index: number, n: number): number {
  return Math.floor(index / n);
}

export function colOf(index: number, n: number): number {
  return index % n;
}

export function isPermutationOf(tiles: readonly number[], n: number): boolean {
  const total = n * n;
  if (tiles.length !== total) return false;
  const seen = new Set<number>();
  for (const value of tiles) {
    if (value < 0 || value >= total || seen.has(value)) return false;
    seen.add(value);
  }
  return seen.size === total;
}

export function countInversions(tiles: readonly number[]): number {
  const seq = tiles.filter((value) => value !== 0);
  let inversions = 0;
  for (let i = 0; i < seq.length; i += 1) {
    for (let j = i + 1; j < seq.length; j += 1) {
      if (seq[i]! > seq[j]!) inversions += 1;
    }
  }
  return inversions;
}

export function blankRowFromBottom(tiles: readonly number[], n: number): number {
  return n - rowOf(blankIndex(tiles), n);
}

/**
 * Solvability by the classic parity rule: odd boards are solvable when the
 * inversion count is even; even boards when inversions plus the blank's
 * one-indexed row from the bottom is odd.
 */
export function isSolvable(tiles: readonly number[], n: number): boolean {
  const inversions = countInversions(tiles);
  if (n % 2 === 1) return inversions % 2 === 0;
  return (inversions + blankRowFromBottom(tiles, n)) % 2 === 1;
}

/**
 * Arrow move — a tile slides into the gap in the given travel direction:
 * "up" pulls the tile below the gap up, "down" the tile above, and so on.
 * Returns null when no tile borders the gap on that side.
 */
export function arrowMove(board: Board, dir: SlideDir): Board | null {
  const { n, tiles } = board;
  const blank = blankIndex(tiles);
  const blankRow = rowOf(blank, n);
  const blankCol = colOf(blank, n);
  let sourceRow = blankRow;
  let sourceCol = blankCol;
  if (dir === "up") sourceRow = blankRow + 1;
  else if (dir === "down") sourceRow = blankRow - 1;
  else if (dir === "left") sourceCol = blankCol + 1;
  else sourceCol = blankCol - 1;
  if (sourceRow < 0 || sourceRow >= n || sourceCol < 0 || sourceCol >= n) return null;
  const source = sourceRow * n + sourceCol;
  const next = tiles.slice();
  next[blank] = next[source]!;
  next[source] = 0;
  return { n, tiles: next };
}

/**
 * Click move — sliding a whole segment. Clicking any tile in the gap's row or
 * column shifts the tiles between it and the gap one step toward the gap, so
 * the clicked tile lands where the gap was. Returns null for the gap itself or
 * a tile that shares neither the gap's row nor column.
 */
export function clickMove(board: Board, index: number): Board | null {
  const { n, tiles } = board;
  if (index < 0 || index >= n * n) return null;
  const blank = blankIndex(tiles);
  if (index === blank) return null;
  const row = rowOf(index, n);
  const col = colOf(index, n);
  const blankRow = rowOf(blank, n);
  const blankCol = colOf(blank, n);
  if (row !== blankRow && col !== blankCol) return null;
  const next = tiles.slice();
  let cursor = blank;
  if (row === blankRow) {
    const step = col < blankCol ? -1 : 1;
    while (colOf(cursor, n) !== col) {
      const from = cursor + step;
      next[cursor] = next[from]!;
      next[from] = 0;
      cursor = from;
    }
  } else {
    const step = row < blankRow ? -n : n;
    while (rowOf(cursor, n) !== row) {
      const from = cursor + step;
      next[cursor] = next[from]!;
      next[from] = 0;
      cursor = from;
    }
  }
  return { n, tiles: next };
}

function fisherYates(base: readonly number[], rng: () => number): number[] {
  const out = base.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/**
 * Shuffle by full permutation, then repair parity so the result is always
 * solvable (swapping two non-blank tiles flips solvability without moving the
 * gap). Never returns the solved arrangement.
 */
export function shuffleByPermutation(n: number, rng: () => number): number[] {
  let tiles = fisherYates(solvedTiles(n), rng);
  if (!isSolvable(tiles, n)) {
    const nonBlank: number[] = [];
    for (let i = 0; i < tiles.length && nonBlank.length < 2; i += 1) {
      if (tiles[i] !== 0) nonBlank.push(i);
    }
    const [a, b] = nonBlank;
    const tmp = tiles[a!]!;
    tiles[a!] = tiles[b!]!;
    tiles[b!] = tmp;
  }
  if (isSolved({ n, tiles })) tiles = shuffleByPermutation(n, rng);
  return tiles;
}

/**
 * Shuffle by a seeded random walk from the solved board — always solvable by
 * construction. Avoids immediately undoing the previous slide and never
 * returns the solved arrangement.
 */
export function shuffleByWalk(n: number, rng: () => number, steps: number): number[] {
  const dirs: readonly SlideDir[] = ["up", "down", "left", "right"];
  let tiles = solvedTiles(n);
  let previousBlank = -1;
  for (let s = 0; s < steps; s += 1) {
    const currentBlank = blankIndex(tiles);
    const all: Board[] = [];
    const preferred: Board[] = [];
    for (const dir of dirs) {
      const moved = arrowMove({ n, tiles }, dir);
      if (moved === null) continue;
      all.push(moved);
      if (blankIndex(moved.tiles) !== previousBlank) preferred.push(moved);
    }
    const pool = preferred.length > 0 ? preferred : all;
    const choice = pool[Math.floor(rng() * pool.length)]!;
    previousBlank = currentBlank;
    tiles = choice.tiles.slice();
  }
  if (isSolved({ n, tiles })) return shuffleByWalk(n, rng, steps + 1);
  return tiles;
}

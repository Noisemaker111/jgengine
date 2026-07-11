import {
  COLS,
  ROWS,
  CONNECT,
  type Board,
  type Cell,
  type Player,
  drop,
  index,
  inBounds,
  legalColumns,
  other,
  wouldWin,
} from "./board";

export type AiLevel = "easy" | "medium" | "hard";

const CENTER = (COLS - 1) / 2;
/** Center-first move ordering sharpens alpha-beta pruning. */
const SEARCH_ORDER = [3, 2, 4, 1, 5, 0, 6];
const WIN_SCORE = 1_000_000;
const EASY_BLOCK_CHANCE = 0.78;
const DEPTH: Record<Exclude<AiLevel, "easy">, number> = { medium: 4, hard: 7 };

/** All length-CONNECT windows on the grid, precomputed once. */
const WINDOWS: number[][] = buildWindows();

function buildWindows(): number[][] {
  const windows: number[][] = [];
  const dirs: [number, number][] = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      for (const [dc, dr] of dirs) {
        const cells: number[] = [];
        let c = col;
        let r = row;
        let ok = true;
        for (let k = 0; k < CONNECT; k += 1) {
          if (!inBounds(c, r)) {
            ok = false;
            break;
          }
          cells.push(index(c, r));
          c += dc;
          r += dr;
        }
        if (ok) windows.push(cells);
      }
    }
  }
  return windows;
}

function scoreWindow(count: number, empty: number): number {
  if (count === 4) return WIN_SCORE;
  if (count === 3 && empty === 1) return 60;
  if (count === 2 && empty === 2) return 8;
  if (count === 1 && empty === 3) return 1;
  return 0;
}

/** Static evaluation from `me`'s perspective — window control plus center weighting. */
export function evaluate(cells: Cell[], me: Player): number {
  const foe = other(me);
  let score = 0;
  for (const window of WINDOWS) {
    let mine = 0;
    let theirs = 0;
    for (const cell of window) {
      const value = cells[cell]!;
      if (value === me) mine += 1;
      else if (value === foe) theirs += 1;
    }
    if (mine > 0 && theirs > 0) continue;
    const empty = CONNECT - mine - theirs;
    if (mine > 0) score += scoreWindow(mine, empty);
    else if (theirs > 0) score -= scoreWindow(theirs, empty) * 1.1; // lean defensive
  }
  const centerCol = Math.floor(CENTER);
  for (let row = 0; row < ROWS; row += 1) {
    const value = cells[index(centerCol, row)]!;
    if (value === me) score += 5;
    else if (value === foe) score -= 5;
  }
  return score;
}

/** Column where `player` wins immediately, or null. */
export function winningMove(board: Board, player: Player): number | null {
  for (const col of SEARCH_ORDER) {
    if (board.heights[col]! >= ROWS) continue;
    if (wouldWin(board, col, player)) return col;
  }
  return null;
}

function minimax(board: Board, me: Player, depth: number, alpha: number, beta: number): number {
  if (board.status === "won") {
    const magnitude = WIN_SCORE + depth; // prefer faster wins, slower losses
    return board.winner === me ? magnitude : -magnitude;
  }
  if (board.status === "draw") return 0;
  if (depth === 0) return evaluate(board.cells, me);

  const maximizing = board.current === me;
  let best = maximizing ? -Infinity : Infinity;
  let a = alpha;
  let b = beta;
  for (const col of SEARCH_ORDER) {
    const child = drop(board, col);
    if (child === null) continue;
    const value = minimax(child, me, depth - 1, a, b);
    if (maximizing) {
      if (value > best) best = value;
      if (best > a) a = best;
    } else {
      if (value < best) best = value;
      if (best < b) b = best;
    }
    if (b <= a) break;
  }
  return best;
}

function centerWeight(col: number): number {
  return COLS - Math.abs(col - CENTER); // higher toward the middle
}

function pickWeighted(cols: number[], rng: () => number): number {
  let total = 0;
  for (const col of cols) total += centerWeight(col);
  let roll = rng() * total;
  for (const col of cols) {
    roll -= centerWeight(col);
    if (roll <= 0) return col;
  }
  return cols[cols.length - 1]!;
}

/** Break a tie among equally-scored best columns deterministically from the seeded rng. */
function pickTie(cols: number[], rng: () => number): number {
  return cols[Math.floor(rng() * cols.length) % cols.length]!;
}

function searchBest(board: Board, me: Player, depth: number, rng: () => number): number {
  let bestScore = -Infinity;
  let bestCols: number[] = [];
  for (const col of SEARCH_ORDER) {
    const child = drop(board, col);
    if (child === null) continue;
    const score = minimax(child, me, depth - 1, -Infinity, Infinity);
    if (score > bestScore + 1e-6) {
      bestScore = score;
      bestCols = [col];
    } else if (Math.abs(score - bestScore) <= 1e-6) {
      bestCols.push(col);
    }
  }
  if (bestCols.length === 0) return -1;
  return pickTie(bestCols, rng);
}

/**
 * Pick a column for the side to move. All levels take an immediate win; Medium and
 * Hard always block an immediate loss and then search (minimax + alpha-beta), while
 * Easy blocks only most of the time and otherwise plays a center-biased random move.
 */
export function chooseMove(board: Board, level: AiLevel, rng: () => number): number {
  if (board.status !== "playing") return -1;
  const me = board.current;
  const legal = legalColumns(board);
  if (legal.length === 0) return -1;

  const win = winningMove(board, me);
  if (win !== null) return win;

  const block = winningMove(board, other(me));

  if (level === "easy") {
    if (block !== null && rng() < EASY_BLOCK_CHANCE) return block;
    return pickWeighted(legal, rng);
  }

  if (block !== null) return block;
  const move = searchBest(board, me, DEPTH[level], rng);
  return move === -1 ? pickWeighted(legal, rng) : move;
}

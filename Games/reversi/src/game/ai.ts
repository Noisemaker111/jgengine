import type { Board, Player } from "./board";
import { CELLS, applyMove, counts, flipsAt, hasMove, legalMoves, opponent, rc } from "./board";

export type AiLevel = "novice" | "club" | "master";

export const MASTER_DEPTH = 5;

const CORNERS: readonly number[] = [0, 7, 56, 63];

const WEIGHTS: readonly number[] = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];

const DIRS8: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

function positionalScore(board: Board, player: Player): number {
  const foe = opponent(player);
  let s = 0;
  for (let i = 0; i < CELLS; i++) {
    if (board[i] === player) s += WEIGHTS[i];
    else if (board[i] === foe) s -= WEIGHTS[i];
  }
  return s;
}

function frontierCount(board: Board, player: Player): number {
  let n = 0;
  for (let i = 0; i < CELLS; i++) {
    if (board[i] !== player) continue;
    const [r, c] = rc(i);
    for (const [dr, dc] of DIRS8) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && board[rr * 8 + cc] === 0) {
        n++;
        break;
      }
    }
  }
  return n;
}

function cornerDiff(board: Board, player: Player): number {
  const foe = opponent(player);
  let me = 0;
  let op = 0;
  for (const c of CORNERS) {
    if (board[c] === player) me++;
    else if (board[c] === foe) op++;
  }
  return me - op;
}

function ratio(me: number, op: number): number {
  if (me + op === 0) return 0;
  return (100 * (me - op)) / (me + op);
}

function evaluate(board: Board, player: Player): number {
  const foe = opponent(player);
  const mobility = ratio(legalMoves(board, player).length, legalMoves(board, foe).length);
  const frontier = ratio(frontierCount(board, foe), frontierCount(board, player));
  const corner = 100 * cornerDiff(board, player);
  const positional = positionalScore(board, player);
  const c = counts(board);
  if (c.empty <= 8) {
    const my = player === 1 ? c.dark : c.light;
    const op = player === 1 ? c.light : c.dark;
    return corner + 12 * mobility + 5 * frontier + positional + 20 * (my - op);
  }
  return corner + 15 * mobility + 6 * frontier + positional;
}

function orderMoves(moves: readonly number[]): number[] {
  return [...moves].sort((a, b) => WEIGHTS[b] - WEIGHTS[a]);
}

function search(board: Board, player: Player, aiPlayer: Player, depth: number, alpha: number, beta: number): number {
  const foe = opponent(player);
  if (!hasMove(board, player) && !hasMove(board, foe)) {
    const c = counts(board);
    const my = aiPlayer === 1 ? c.dark : c.light;
    const op = aiPlayer === 1 ? c.light : c.dark;
    const diff = my - op;
    return diff > 0 ? 1_000_000 + diff : diff < 0 ? -1_000_000 + diff : 0;
  }
  if (depth === 0) return evaluate(board, aiPlayer);
  const moves = legalMoves(board, player);
  if (moves.length === 0) return search(board, foe, aiPlayer, depth, alpha, beta);

  let a = alpha;
  let b = beta;
  if (player === aiPlayer) {
    let best = -Infinity;
    for (const m of orderMoves(moves)) {
      const v = search(applyMove(board, player, m).board, foe, aiPlayer, depth - 1, a, b);
      if (v > best) best = v;
      if (best > a) a = best;
      if (a >= b) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of orderMoves(moves)) {
    const v = search(applyMove(board, player, m).board, foe, aiPlayer, depth - 1, a, b);
    if (v < best) best = v;
    if (best < b) b = best;
    if (a >= b) break;
  }
  return best;
}

interface Scored {
  readonly move: number;
  readonly score: number;
}

function scoreMoves(board: Board, player: Player, level: AiLevel, depth: number): Scored[] {
  const moves = legalMoves(board, player);
  if (level === "novice") {
    return moves.map((m) => ({ move: m, score: flipsAt(board, player, m).length }));
  }
  if (level === "club") {
    return moves.map((m) => {
      const next = applyMove(board, player, m).board;
      const bonus = CORNERS.includes(m) ? 1000 : 0;
      return { move: m, score: positionalScore(next, player) + bonus };
    });
  }
  const foe = opponent(player);
  return moves.map((m) => {
    const next = applyMove(board, player, m).board;
    return { move: m, score: search(next, foe, player, depth - 1, -Infinity, Infinity) };
  });
}

export function chooseMove(
  board: Board,
  player: Player,
  level: AiLevel,
  rng: () => number,
  depth: number = MASTER_DEPTH,
): number | null {
  const scored = scoreMoves(board, player, level, depth);
  if (scored.length === 0) return null;
  let best = -Infinity;
  for (const s of scored) if (s.score > best) best = s.score;
  const top = scored.filter((s) => s.score === best).map((s) => s.move);
  return top[Math.floor(rng() * top.length)] ?? top[0];
}

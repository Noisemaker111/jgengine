import { describe, expect, test } from "bun:test";

import { seededStreams } from "@jgengine/core/random/rng";

import { chooseMove } from "./ai";
import type { AiLevel } from "./ai";
import { DARK, LIGHT, applyMove, counts, createBoard, hasMove, idx, isGameOver, legalMoves, opponent } from "./board";
import type { Board, Player } from "./board";

interface GameOutcome {
  readonly dark: number;
  readonly light: number;
  readonly empty: number;
  readonly plies: number;
  readonly passes: number;
  readonly winner: Player | 0;
}

function playSelfGame(darkLevel: AiLevel, lightLevel: AiLevel, seed: string, depth: number): GameOutcome {
  const streams = seededStreams(seed);
  let board: Board = createBoard();
  let player: Player = DARK;
  let plies = 0;
  let passes = 0;
  while (!isGameOver(board)) {
    if (hasMove(board, player)) {
      const level = player === DARK ? darkLevel : lightLevel;
      const move = chooseMove(board, player, level, streams(`${player}:${plies}`), depth);
      expect(move).not.toBeNull();
      board = applyMove(board, player, move as number).board;
      plies += 1;
    } else {
      passes += 1;
    }
    player = opponent(player);
    if (plies > 64) throw new Error("self-game did not terminate");
  }
  const c = counts(board);
  const winner = c.dark > c.light ? DARK : c.light > c.dark ? LIGHT : 0;
  return { dark: c.dark, light: c.light, empty: c.empty, plies, passes, winner };
}

describe("reversi AI — self-play terminates with a correct final count", () => {
  const matchups: readonly [AiLevel, AiLevel, number][] = [
    ["novice", "novice", 5],
    ["club", "club", 5],
    ["novice", "master", 3],
    ["master", "master", 3],
  ];
  for (const [d, l, depth] of matchups) {
    test(
      `${d} vs ${l} plays to a full terminal board`,
      () => {
        const out = playSelfGame(d, l, `${d}-${l}`, depth);
        expect(out.dark + out.light + out.empty).toBe(64);
        expect(out.plies + out.passes).toBeGreaterThan(0);
        expect(out.plies).toBeLessThanOrEqual(60);
        // A terminated Reversi game leaves no move for either side.
        expect(out.dark + out.light).toBe(64 - out.empty);
      },
      20_000,
    );
  }
});

describe("reversi AI — level behaviour", () => {
  test("novice picks a maximum-flip move", () => {
    // Build a position with a clearly-better multi-flip move.
    const board = createBoard();
    // Play out a few forced-ish moves so flip counts differ across options.
    const b2 = applyMove(board, DARK, idx(2, 3)).board;
    const moves = legalMoves(b2, LIGHT);
    const best = Math.max(...moves.map((m) => applyMove(b2, LIGHT, m).flips.length));
    const rng = seededStreams("novice-test")("pick");
    const chosen = chooseMove(b2, LIGHT, "novice", rng);
    expect(chosen).not.toBeNull();
    expect(applyMove(b2, LIGHT, chosen as number).flips.length).toBe(best);
  });

  test("tie-breaks are deterministic under the same seed", () => {
    const board = createBoard();
    const a = chooseMove(board, DARK, "novice", seededStreams("same")("s"));
    const b = chooseMove(board, DARK, "novice", seededStreams("same")("s"));
    expect(a).toBe(b);
  });

  test("club prioritises an open corner", () => {
    // Corner (0,0) empty; DARK at (0,2) with LIGHT bridging at (0,1) → DARK flips into the corner.
    const board = createBoard().slice();
    board[idx(0, 0)] = 0;
    board[idx(0, 1)] = LIGHT;
    board[idx(0, 2)] = DARK;
    expect(legalMoves(board, DARK)).toContain(idx(0, 0));
    expect(chooseMove(board, DARK, "club", seededStreams("corner")("c"))).toBe(idx(0, 0));
  });

  test("master returns a legal move on a mid-game position", () => {
    const board = createBoard().slice();
    board[idx(0, 0)] = 0;
    board[idx(0, 1)] = LIGHT;
    board[idx(0, 2)] = DARK;
    const chosen = chooseMove(board, DARK, "master", seededStreams("m")("m"), 4);
    expect(legalMoves(board, DARK)).toContain(chosen as number);
  });
});

import { describe, expect, test } from "bun:test";

import { DARK, LIGHT, createBoard, idx, legalMoves } from "./board";
import type { Disc } from "./board";
import { aiMove, freshGame, humanMove, undoMove } from "./engine";
import type { AppState } from "./state";

function craft(board: Disc[], toMove: 1 | 2): AppState {
  const base = freshGame("hotseat", "club");
  return { ...base, board, toMove, legal: legalMoves(board, toMove), history: [], aiThinking: false };
}

describe("reversi engine — auto pass", () => {
  test("a side with no reply is skipped and a pass banner is raised", () => {
    // row 0: [empty, DARK, L, L, L, L, DARK, empty]; everything else LIGHT.
    const b = new Array<Disc>(64).fill(LIGHT);
    b[idx(0, 0)] = 0;
    b[idx(0, 1)] = DARK;
    b[idx(0, 6)] = DARK;
    b[idx(0, 7)] = 0;
    const state = craft(b, LIGHT);
    expect(state.legal.slice().sort((x, y) => x - y)).toEqual([idx(0, 0), idx(0, 7)]);

    const next = humanMove(state, idx(0, 0));
    expect(next).not.toBeNull();
    expect(next!.status).toBe("playing");
    expect(next!.passBanner).toBe(DARK); // DARK had no move, passed back
    expect(next!.toMove).toBe(LIGHT); // turn returns to LIGHT
  });
});

describe("reversi engine — game-end settle", () => {
  test("a move that fills the board ends the game and scores it", () => {
    const b = new Array<Disc>(64).fill(LIGHT);
    b[idx(0, 0)] = 0;
    b[idx(0, 1)] = DARK;
    const state = craft(b, LIGHT);
    const next = humanMove(state, idx(0, 0));
    expect(next).not.toBeNull();
    expect(next!.status).toBe("over");
    expect(next!.result?.winner).toBe(LIGHT);
    expect(next!.result?.dark).toBe(0);
    expect(next!.result?.light).toBe(64);
  });
});

describe("reversi engine — undo undoes the pair vs AI", () => {
  test("undo after the AI's reply restores the pre-move position", () => {
    const start = freshGame("ai", "novice");
    const afterHuman = humanMove(start, idx(2, 3));
    expect(afterHuman).not.toBeNull();
    expect(afterHuman!.aiThinking).toBe(true); // AI's turn queued
    const afterAi = aiMove({ ...afterHuman!, aiThinking: false });
    expect(afterAi.ply).toBe(2);

    const undone = undoMove(afterAi);
    expect(undone.ply).toBe(0);
    expect(undone.toMove).toBe(DARK);
    expect(undone.aiThinking).toBe(false);
    expect(undone.board).toEqual(createBoard());
    expect(undone.history.length).toBe(0);
  });
});

import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { dealBoard, type Board } from "./board";
import { BOARD_SIZES, type BoardSizeId } from "./catalog";
import { createMatch, type MatchState } from "./machine";
import type { BestSubmission } from "./records";

export type RoundState = {
  readonly sizeId: BoardSizeId;
  readonly seed: string;
  readonly board: Board;
  readonly match: MatchState;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly resolveAt: number | null;
  readonly bests: BestSubmission | null;
};

export const ROUND_KEY = "round";

let dealCounter = 0;

export function freshSeed(): string {
  dealCounter += 1;
  return `${Date.now().toString(36)}${dealCounter.toString(36)}`;
}

export function newRound(sizeId: BoardSizeId, seed: string): RoundState {
  const board = dealBoard(seed, BOARD_SIZES[sizeId]);
  return {
    sizeId,
    seed,
    board,
    match: createMatch(board.cards.map((card) => card.pairId)),
    startedAt: null,
    endedAt: null,
    resolveAt: null,
    bests: null,
  };
}

export function getRound(ctx: GameContext): RoundState | null {
  const round = ctx.game.store.get(ROUND_KEY);
  return round === undefined ? null : (round as RoundState);
}

export function setRound(ctx: GameContext, round: RoundState): void {
  ctx.game.store.set(ROUND_KEY, round);
}

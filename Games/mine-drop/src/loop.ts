import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { GameLoop } from "@jgengine/core/game/defineGame";

import {
  bombTotal,
  colOf,
  countFlagged,
  countRevealed,
  createBoard,
  idx,
  isWin,
  makeRng,
  reveal,
  rowOf,
  safeRemaining,
  toggleFlag,
  type Board,
} from "./game/board";
import { resetCompanions, scatterCompanions, setCompanionsY, spawnCompanions } from "./game/companions";
import { PLAYER_CATALOG } from "./game/content";
import { cellFromPosition, easeInFall, isLanded } from "./game/phase";
import { buildBoard, buildRoom, clearBoard, openCell, placeRevealed, revealBombs, setFlag } from "./game/scene";
import {
  BLAST_UP,
  BOARD_N,
  BOMB_COUNT,
  BOOM_HOLD_SECONDS,
  CELL_PITCH,
  FLOOR_Y,
  FOOTPRINT_RADIUS,
  REVEAL_HOLD_SECONDS,
  STATUS_FEED,
  TABLE_TOP,
  cellWorld,
  type Phase,
} from "./game/tuning";

const CENTER = Math.round((BOARD_N - 1) / 2);
const CENTER_INDEX = idx(BOARD_N, CENTER, CENTER);
const [CENTER_X, CENTER_Z] = cellWorld(CENTER, CENTER);

const FALL_ANIM = 0.85;
const FALL_TIMEOUT = 2.6;
const BOOM_SCATTER_TIME = 1.1;

interface RoundState {
  phase: Phase;
  board: Board;
  seed: number;
  digCol: number;
  digRow: number;
  digIndex: number;
  tFall: number;
  tReveal: number;
  tBoom: number;
  jumpWasDown: boolean;
}

const round: RoundState = {
  phase: "ready",
  board: createBoard(BOARD_N, 0, makeRng(1)),
  seed: 1,
  digCol: -1,
  digRow: -1,
  digIndex: -1,
  tFall: 0,
  tReveal: 0,
  tBoom: 0,
  jumpWasDown: false,
};

function startRound(ctx: GameContext, seed: number): void {
  round.seed = seed;
  round.board = createBoard(BOARD_N, BOMB_COUNT, makeRng(seed), CENTER_INDEX);
  round.phase = "ready";
  round.digCol = -1;
  round.digRow = -1;
  round.digIndex = -1;
  round.tFall = 0;
  round.tReveal = 0;
  round.tBoom = 0;
  round.jumpWasDown = false;
  clearBoard(ctx);
  buildBoard(ctx);
  resetCompanions(ctx);
  ctx.player.motion.setY(TABLE_TOP);
}

function playerCell(ctx: GameContext): { col: number; row: number; index: number } | null {
  const p = ctx.scene.entity.get(ctx.player.userId);
  if (p === null) return null;
  return cellFromPosition(p.position[0], p.position[2], BOARD_N, CELL_PITCH, FOOTPRINT_RADIUS + 0.45);
}

function status(ctx: GameContext, kind: string, extra?: Record<string, unknown>): void {
  ctx.game.feed.push(STATUS_FEED, { kind, ...extra });
}

function beginDig(ctx: GameContext, cell: { col: number; row: number; index: number }, now: number): void {
  round.digCol = cell.col;
  round.digRow = cell.row;
  round.digIndex = cell.index;
  openCell(ctx, cell.col, cell.row);
  round.phase = "falling";
  round.tFall = now;
  status(ctx, "drop");
}

function resolveLanding(ctx: GameContext, now: number): void {
  const result = reveal(round.board, round.digIndex);
  if (result.hitBomb) {
    round.phase = "boom";
    round.tBoom = now;
    revealBombs(ctx, round.board);
    ctx.player.motion.impulse(BLAST_UP);
    status(ctx, "boom");
    return;
  }
  round.phase = "revealing";
  round.tReveal = now;
  for (const i of result.opened) {
    placeRevealed(ctx, colOf(BOARD_N, i), rowOf(BOARD_N, i), round.board.adjacent[i] ?? 0);
  }
  status(ctx, "safe", { opened: result.opened.length });
}

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define("flag", {
    apply(state) {
      if (round.phase !== "ready") return state;
      const cell = playerCell(state);
      if (cell === null || round.board.revealed[cell.index]) return state;
      const flagged = toggleFlag(round.board, cell.index);
      setFlag(state, cell.col, cell.row, flagged);
      return state;
    },
  });

  ctx.game.commands.define("restart", {
    apply(state) {
      startRound(state, round.seed + 1);
      return state;
    },
  });

  buildRoom(ctx);
  spawnCompanions(ctx);
  startRound(ctx, round.seed);
}

export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(PLAYER_CATALOG, {
    id: ctx.player.userId,
    position: [CENTER_X, TABLE_TOP, CENTER_Z],
    rotationY: Math.PI,
    role: "player",
  });
}

export function onTick(ctx: GameContext, dt: number): void {
  const now = ctx.time.now();
  const jumpDown = ctx.input.isDown("jump");
  const jumpPressed = jumpDown && !round.jumpWasDown;
  round.jumpWasDown = jumpDown;

  switch (round.phase) {
    case "ready": {
      if (jumpPressed) {
        const cell = playerCell(ctx);
        if (cell !== null && !round.board.revealed[cell.index]) {
          beginDig(ctx, cell, now);
        }
      }
      return;
    }

    case "falling": {
      setCompanionsY(ctx, easeInFall(now, round.tFall, FALL_ANIM, TABLE_TOP, FLOOR_Y), dt);
      const player = ctx.scene.entity.get(ctx.player.userId);
      const landed = player !== null && isLanded(player.position[1], FLOOR_Y);
      if (landed || now - round.tFall > FALL_TIMEOUT) resolveLanding(ctx, now);
      return;
    }

    case "revealing": {
      setCompanionsY(ctx, FLOOR_Y, dt);
      if (now - round.tReveal >= REVEAL_HOLD_SECONDS) {
        ctx.player.motion.setY(TABLE_TOP);
        setCompanionsY(ctx, TABLE_TOP, dt);
        if (isWin(round.board)) {
          round.phase = "win";
          status(ctx, "win");
        } else {
          round.phase = "ready";
        }
      }
      return;
    }

    case "boom": {
      const t = (now - round.tBoom) / BOOM_SCATTER_TIME;
      scatterCompanions(ctx, Math.min(1, t), dt);
      void BOOM_HOLD_SECONDS;
      return;
    }

    default:
      return;
  }
}

export const loop: Required<GameLoop<GameContext>> = { onInit, onNewPlayer, onTick };

export interface RoundSnapshot {
  phase: Phase;
  seed: number;
  boardN: number;
  safeRemaining: number;
  revealed: number;
  bombs: number;
  flags: number;
}

export function roundSnapshot(): RoundSnapshot {
  return {
    phase: round.phase,
    seed: round.seed,
    boardN: BOARD_N,
    safeRemaining: safeRemaining(round.board),
    revealed: countRevealed(round.board),
    bombs: bombTotal(round.board),
    flags: countFlagged(round.board),
  };
}

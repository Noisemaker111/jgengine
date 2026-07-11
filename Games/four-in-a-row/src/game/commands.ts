import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { chooseMove, type AiLevel } from "./logic/ai";
import {
  boardFromMoves,
  createBoard,
  drop,
  other,
  type Board,
  type Move,
  type Player,
} from "./logic/board";
import { readRecords, recordResult, resetRecords, type Outcome } from "./records";
import {
  AI_PLAYER,
  AI_THINK_MS,
  HUMAN_PLAYER,
  STORE_KEY,
  aiLevel,
  freshSeed,
  isAiMode,
  type AppState,
  type Mode,
} from "./state";

function getApp(ctx: GameContext): AppState | undefined {
  return ctx.game.store.get(STORE_KEY) as AppState | undefined;
}

function setApp(ctx: GameContext, app: AppState): void {
  ctx.game.store.set(STORE_KEY, app);
}

function newGameState(app: AppState, mode: Mode, first: Player): AppState {
  return {
    ...app,
    mode,
    firstPlayer: first,
    seed: freshSeed(),
    board: createBoard(first),
    aiThinking: false,
    aiCountdownMs: null,
    outcome: null,
    newBestStreak: false,
    recorded: false,
    records: readRecords(),
  };
}

/** Fold a resolved board back into app state, recording the first completion of a vs-AI game. */
function commitBoard(ctx: GameContext, app: AppState, board: Board): void {
  let { outcome, newBestStreak, recorded, records } = app;
  const justEnded = board.status !== "playing" && app.board.status === "playing";

  if (justEnded && isAiMode(app.mode) && !recorded) {
    const level = aiLevel(app.mode) as AiLevel;
    const result: Outcome = board.status === "draw" ? "draw" : board.winner === HUMAN_PLAYER ? "win" : "loss";
    const folded = recordResult(level, result);
    outcome = result;
    newBestStreak = folded.newBestStreak;
    records = folded.view;
    recorded = true;
  } else if (justEnded && !isAiMode(app.mode)) {
    outcome = null; // hotseat banners read the winner directly
  }

  setApp(ctx, { ...app, board, aiThinking: false, aiCountdownMs: null, outcome, newBestStreak, recorded, records });
}

function applyDrop(ctx: GameContext, col: number): void {
  const app = getApp(ctx);
  if (app === undefined) return;
  const board = app.board;
  if (board.status !== "playing") return;
  if (isAiMode(app.mode) && board.current !== HUMAN_PLAYER) return; // not the human's turn
  const next = drop(board, col);
  if (next === null) return;
  commitBoard(ctx, app, next);
}

/** Called from onTick once the AI's think delay elapses. */
function runAiMove(ctx: GameContext): void {
  const app = getApp(ctx);
  if (app === undefined) return;
  const board = app.board;
  const level = aiLevel(app.mode);
  if (level === null || board.status !== "playing" || board.current !== AI_PLAYER) return;
  const rng = seededRng(`${app.seed}:${board.moves.length}`);
  const col = chooseMove(board, level, rng);
  if (col < 0) return;
  const next = drop(board, col);
  if (next === null) return;
  commitBoard(ctx, app, next);
}

/** Drive the AI's turn: schedule a think delay, then commit its move. Mutates the countdown in place. */
export function stepAi(ctx: GameContext, dt: number): void {
  const app = getApp(ctx);
  if (app === undefined) return;
  const board = app.board;
  const aiTurn = isAiMode(app.mode) && board.status === "playing" && board.current === AI_PLAYER;
  if (!aiTurn) {
    if (app.aiCountdownMs !== null) app.aiCountdownMs = null;
    return;
  }
  if (app.aiCountdownMs === null) {
    app.aiCountdownMs = AI_THINK_MS;
    setApp(ctx, { ...app, aiThinking: true });
    return;
  }
  app.aiCountdownMs -= dt * 1000;
  if (app.aiCountdownMs <= 0) {
    app.aiCountdownMs = null;
    runAiMove(ctx);
  }
}

function undo(ctx: GameContext): void {
  const app = getApp(ctx);
  if (app === undefined) return;
  const moves: Move[] = app.board.moves.slice();
  if (moves.length === 0) return;
  if (isAiMode(app.mode)) {
    while (moves.length > 0 && moves[moves.length - 1]!.player === AI_PLAYER) moves.pop();
    if (moves.length > 0) moves.pop(); // the human's move
  } else {
    moves.pop();
  }
  const board = boardFromMoves(moves, app.firstPlayer);
  setApp(ctx, { ...app, board, aiThinking: false, aiCountdownMs: null, outcome: null, newBestStreak: false });
}

export function initApp(ctx: GameContext): void {
  const first = HUMAN_PLAYER;
  const app: AppState = {
    board: createBoard(first),
    mode: "medium",
    firstPlayer: first,
    seed: freshSeed(),
    aiThinking: false,
    aiCountdownMs: null,
    outcome: null,
    newBestStreak: false,
    recorded: false,
    records: readRecords(),
  };
  setApp(ctx, app);
}

const MODES: Mode[] = ["easy", "medium", "hard", "hotseat"];

export function registerCommands(ctx: GameContext): void {
  const commands = ctx.game.commands;

  commands.define<{ col: number }>("drop", { apply: (context, input) => applyDrop(context, input.col) });
  for (let n = 1; n <= 7; n += 1) {
    commands.define(`dropColumn${n}`, { apply: (context) => applyDrop(context, n - 1) });
  }

  commands.define("undoMove", { apply: (context) => undo(context) });

  commands.define("rematch", {
    apply(context) {
      const app = getApp(context);
      if (app === undefined) return;
      setApp(context, newGameState(app, app.mode, other(app.firstPlayer)));
    },
  });

  commands.define<{ mode: Mode }>("setMode", {
    apply(context, input) {
      const app = getApp(context);
      if (app === undefined) return;
      const mode = MODES.includes(input.mode) ? input.mode : app.mode;
      setApp(context, newGameState(app, mode, HUMAN_PLAYER));
    },
  });

  commands.define("resetRecords", {
    apply(context) {
      const app = getApp(context);
      if (app === undefined) return;
      setApp(context, { ...app, records: resetRecords(), newBestStreak: false });
    },
  });
}

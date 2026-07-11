import { dailySeed } from "@jgengine/core/random/seedLink";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { readBests, submitTime } from "./records";
import { pushUrl, readUrlSpec, shareUrl } from "./seedShare";
import {
  createBoard,
  elapsedSeconds,
  eraseCell,
  hintCell,
  isGiven,
  moveSelection,
  pickRandomEmpty,
  placeDigit,
  selectCell,
  toggleNote,
  type Board,
} from "./sudoku/board";
import { type Difficulty } from "./sudoku/difficulty";
import { freshSeed, HISTORY_LIMIT, STORE_KEY, type AppState } from "./state";

function getApp(ctx: GameContext): AppState | undefined {
  return ctx.game.store.get(STORE_KEY) as AppState | undefined;
}

function setApp(ctx: GameContext, app: AppState): void {
  ctx.game.store.set(STORE_KEY, app);
}

/** Selection / navigation change — no undo entry, no win check. */
function setBoard(ctx: GameContext, app: AppState, board: Board): void {
  if (board === app.board) return;
  setApp(ctx, { ...app, board });
}

/** A content change — records history for undo and settles a fresh win. */
function commit(ctx: GameContext, app: AppState, board: Board): void {
  if (board === app.board) return;
  const past = [...app.past, app.board].slice(-HISTORY_LIMIT);
  let win = app.win;
  let bests = app.bests;
  if (board.status === "won" && app.board.status !== "won") {
    const seconds = elapsedSeconds(board);
    let newBest = false;
    if (!board.isDaily) {
      newBest = submitTime(board.difficulty, seconds);
      bests = readBests();
    }
    win = { difficulty: board.difficulty, seconds, hintsUsed: board.hintsUsed, newBest };
  }
  setApp(ctx, { ...app, board, past, win, bests });
}

function startGame(ctx: GameContext, difficulty: Difficulty, seed: string, isDaily = false): void {
  const app = getApp(ctx);
  if (app === undefined) return;
  setApp(ctx, { ...app, board: createBoard(difficulty, seed, isDaily), past: [], win: null });
}

export function initApp(ctx: GameContext): void {
  const fromUrl = readUrlSpec();
  const difficulty = fromUrl?.difficulty ?? "easy";
  const seed = fromUrl?.seed ?? freshSeed();
  const app: AppState = {
    board: createBoard(difficulty, seed),
    settings: { notesMode: false, showErrors: false },
    bests: readBests(),
    past: [],
    win: null,
  };
  setApp(ctx, app);
}

export function registerCommands(ctx: GameContext): void {
  const commands = ctx.game.commands;

  commands.define<{ index: number }>("select", {
    apply(context, input) {
      const app = getApp(context);
      if (app !== undefined) setBoard(context, app, selectCell(app.board, input.index));
    },
  });

  const nav = (dRow: number, dCol: number) => (context: GameContext) => {
    const app = getApp(context);
    if (app !== undefined) setBoard(context, app, moveSelection(app.board, dRow, dCol));
  };
  commands.define("navUp", { apply: nav(-1, 0) });
  commands.define("navDown", { apply: nav(1, 0) });
  commands.define("navLeft", { apply: nav(0, -1) });
  commands.define("navRight", { apply: nav(0, 1) });

  const inputDigit = (context: GameContext, digit: number) => {
    const app = getApp(context);
    if (app === undefined || app.board.selected === null) return;
    const sel = app.board.selected;
    const next = app.settings.notesMode ? toggleNote(app.board, sel, digit) : placeDigit(app.board, sel, digit);
    commit(context, app, next);
  };
  for (let d = 1; d <= 9; d += 1) {
    commands.define(`num${d}`, { apply: (context) => inputDigit(context, d) });
  }

  commands.define("erase", {
    apply(context) {
      const app = getApp(context);
      if (app === undefined || app.board.selected === null) return;
      commit(context, app, eraseCell(app.board, app.board.selected));
    },
  });

  commands.define("hint", {
    apply(context) {
      const app = getApp(context);
      if (app === undefined) return;
      const sel = app.board.selected;
      const usable = sel !== null && !isGiven(app.board, sel) && app.board.values[sel] !== app.board.solution[sel];
      const target = usable ? sel : pickRandomEmpty(app.board);
      if (target === null) return;
      commit(context, app, hintCell(app.board, target));
    },
  });

  commands.define("undo", {
    apply(context) {
      const app = getApp(context);
      if (app === undefined || app.past.length === 0) return;
      const prev = app.past[app.past.length - 1];
      const board: Board = {
        ...prev,
        elapsedMs: app.board.elapsedMs,
        started: app.board.started,
        selected: app.board.selected,
      };
      setApp(context, { ...app, board, past: app.past.slice(0, -1), win: null });
    },
  });

  commands.define("toggleNotes", {
    apply(context) {
      const app = getApp(context);
      if (app !== undefined) setApp(context, { ...app, settings: { ...app.settings, notesMode: !app.settings.notesMode } });
    },
  });

  commands.define("toggleErrors", {
    apply(context) {
      const app = getApp(context);
      if (app !== undefined) setApp(context, { ...app, settings: { ...app.settings, showErrors: !app.settings.showErrors } });
    },
  });

  commands.define("newGame", {
    apply(context) {
      const app = getApp(context);
      if (app !== undefined) startGame(context, app.board.difficulty, freshSeed());
    },
  });

  const difficulties: Difficulty[] = ["easy", "medium", "hard", "expert"];
  for (const difficulty of difficulties) {
    const name = `difficulty${difficulty[0].toUpperCase()}${difficulty.slice(1)}`;
    commands.define(name, { apply: (context) => startGame(context, difficulty, freshSeed()) });
  }

  commands.define("daily", {
    apply(context) {
      const app = getApp(context);
      if (app === undefined) return;
      const difficulty = app.board.difficulty;
      const seed = dailySeed(Date.now(), "sudoku");
      startGame(context, difficulty, seed, true);
      pushUrl(shareUrl(seed, difficulty));
    },
  });
}

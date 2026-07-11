import { dailySeed } from "@jgengine/core/random/seedLink";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import {
  chord,
  createBoard,
  cycleMark,
  DIFFICULTIES,
  elapsedSeconds,
  isStandard,
  normalizeConfig,
  reveal,
  type Board,
  type BoardConfig,
  type Difficulty,
  type StandardDifficulty,
} from "./board";
import { readBests, submitTime } from "./records";
import { pushUrl, readUrlSpec, shareUrl } from "./seedShare";
import { freshSeed, STORE_KEY, type AppState } from "./state";

function getApp(ctx: GameContext): AppState | undefined {
  return ctx.game.store.get(STORE_KEY) as AppState | undefined;
}

function setApp(ctx: GameContext, app: AppState): void {
  ctx.game.store.set(STORE_KEY, app);
}

function configFor(difficulty: Difficulty, custom: BoardConfig): BoardConfig {
  return isStandard(difficulty) ? DIFFICULTIES[difficulty] : custom;
}

function startBoard(ctx: GameContext, board: Board, patch: Partial<AppState> = {}): void {
  const app = getApp(ctx);
  if (app === undefined) return;
  setApp(ctx, { ...app, board, result: null, ...patch });
}

/** Fold a resolved board back into app state, recording best times and win/lose feedback. */
function settle(ctx: GameContext, app: AppState, board: Board): void {
  let result = app.result;
  let bests = app.bests;
  if (board.status === "won" && app.board.status !== "won") {
    const seconds = elapsedSeconds(board);
    let newBest = false;
    if (isStandard(board.difficulty) && !board.isDaily) {
      newBest = submitTime(board.difficulty, seconds);
      bests = readBests();
    }
    result = { won: true, difficulty: board.difficulty, seconds, newBest };
  } else if (board.status === "lost" && app.board.status !== "lost") {
    result = { won: false, difficulty: board.difficulty, seconds: elapsedSeconds(board), newBest: false };
  }
  setApp(ctx, { ...app, board, result, bests });
}

function startStandard(ctx: GameContext, difficulty: StandardDifficulty): void {
  startBoard(ctx, createBoard(DIFFICULTIES[difficulty], freshSeed(), difficulty));
}

export function initApp(ctx: GameContext): void {
  const fromUrl = readUrlSpec();
  const difficulty = fromUrl?.difficulty ?? "beginner";
  const config = fromUrl?.config ?? DIFFICULTIES.beginner;
  const seed = fromUrl?.seed ?? freshSeed();
  const board = createBoard(config, seed, difficulty);
  const app: AppState = {
    board,
    settings: { questionsEnabled: true },
    result: null,
    bests: readBests(),
    customConfig: difficulty === "custom" ? config : DIFFICULTIES.intermediate,
  };
  setApp(ctx, app);
}

export function registerCommands(ctx: GameContext): void {
  const commands = ctx.game.commands;

  commands.define<{ index: number }>("reveal", {
    apply(context, input) {
      const app = getApp(context);
      if (app === undefined) return;
      settle(context, app, reveal(app.board, input.index));
    },
  });

  commands.define<{ index: number }>("mark", {
    apply(context, input) {
      const app = getApp(context);
      if (app === undefined) return;
      setApp(context, { ...app, board: cycleMark(app.board, input.index, app.settings.questionsEnabled) });
    },
  });

  commands.define<{ index: number }>("chord", {
    apply(context, input) {
      const app = getApp(context);
      if (app === undefined) return;
      settle(context, app, chord(app.board, input.index));
    },
  });

  commands.define("newGame", {
    apply(context) {
      const app = getApp(context);
      if (app === undefined) return;
      const config = configFor(app.board.difficulty, app.customConfig);
      startBoard(context, createBoard(config, freshSeed(), app.board.difficulty));
    },
  });

  commands.define("difficultyBeginner", { apply: (context) => startStandard(context, "beginner") });
  commands.define("difficultyIntermediate", { apply: (context) => startStandard(context, "intermediate") });
  commands.define("difficultyExpert", { apply: (context) => startStandard(context, "expert") });

  commands.define<{ cols: number; rows: number; mines: number }>("custom", {
    apply(context, input) {
      const app = getApp(context);
      if (app === undefined) return;
      const config = normalizeConfig(input.cols, input.rows, input.mines);
      startBoard(context, createBoard(config, freshSeed(), "custom"), { customConfig: config });
    },
  });

  commands.define("daily", {
    apply(context) {
      const app = getApp(context);
      if (app === undefined) return;
      const difficulty = isStandard(app.board.difficulty) ? app.board.difficulty : "beginner";
      const config = DIFFICULTIES[difficulty];
      const seed = dailySeed(Date.now(), "flag-sweep");
      startBoard(context, createBoard(config, seed, difficulty, true));
      pushUrl(shareUrl(seed, difficulty, config));
    },
  });

  commands.define("toggleQuestions", {
    apply(context) {
      const app = getApp(context);
      if (app === undefined) return;
      setApp(context, { ...app, settings: { ...app.settings, questionsEnabled: !app.settings.questionsEnabled } });
    },
  });
}

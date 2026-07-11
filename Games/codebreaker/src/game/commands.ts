import { dailySeed } from "@jgengine/core/random/seedLink";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import {
  addPeg,
  clearActive,
  createRound,
  modeKey,
  removePeg,
  submitGuess,
  type Options,
  type Round,
} from "./codebreaker";
import { readRecords, recordLoss, recordWin } from "./records";
import { pushUrl, readUrlSpec, shareUrl } from "./seedShare";
import { STORE_KEY, freshSeed, type AppState, type GameResult } from "./state";

const DEFAULT_OPTIONS: Options = { duplicates: true, hard: false };

function getApp(ctx: GameContext): AppState | undefined {
  return ctx.game.store.get(STORE_KEY) as AppState | undefined;
}

function setApp(ctx: GameContext, app: AppState): void {
  ctx.game.store.set(STORE_KEY, app);
}

function currentOptions(ctx: GameContext): Options {
  return getApp(ctx)?.round.options ?? DEFAULT_OPTIONS;
}

function startRound(ctx: GameContext, round: Round): void {
  setApp(ctx, { round, records: getApp(ctx)?.records ?? readRecords(), result: null });
}

/** Fold a resolved round back into app state, recording records + win/loss feedback. */
function settle(ctx: GameContext, app: AppState, round: Round): void {
  if (round.status === app.round.status) {
    setApp(ctx, { ...app, round });
    return;
  }
  const mode = modeKey(round.options);
  const ranked = round.kind === "ranked";
  let records = app.records;
  let result: GameResult | null = app.result;
  if (round.status === "won") {
    if (ranked) {
      const outcome = recordWin(mode, round.guesses.length);
      records = readRecords();
      result = { won: true, guesses: round.guesses.length, mode, kind: round.kind, ...outcome };
    } else {
      result = {
        won: true,
        guesses: round.guesses.length,
        mode,
        kind: round.kind,
        streak: records[mode].streak,
        newBestStreak: false,
        newFewest: false,
      };
    }
  } else if (round.status === "lost") {
    if (ranked) {
      recordLoss(mode);
      records = readRecords();
    }
    result = {
      won: false,
      guesses: round.guesses.length,
      mode,
      kind: round.kind,
      streak: records[mode].streak,
      newBestStreak: false,
      newFewest: false,
    };
  }
  setApp(ctx, { ...app, round, records, result });
}

export function initApp(ctx: GameContext): void {
  const spec = readUrlSpec();
  const options = spec?.options ?? DEFAULT_OPTIONS;
  const seed = spec?.seed ?? freshSeed();
  const kind = spec === null ? "ranked" : "shared";
  setApp(ctx, { round: createRound(seed, options, kind), records: readRecords(), result: null });
}

function place(ctx: GameContext, color: number): void {
  const app = getApp(ctx);
  if (app === undefined) return;
  setApp(ctx, { ...app, round: addPeg(app.round, color) });
}

export function registerCommands(ctx: GameContext): void {
  const commands = ctx.game.commands;

  for (let slot = 1; slot <= 8; slot += 1) {
    commands.define(`color${slot}`, { apply: (context) => place(context, slot - 1) });
  }
  commands.define<{ color: number }>("placePeg", {
    apply: (context, input) => place(context, input.color),
  });

  commands.define("deletePeg", {
    apply(context) {
      const app = getApp(context);
      if (app === undefined) return;
      setApp(context, { ...app, round: removePeg(app.round) });
    },
  });

  commands.define("clearRow", {
    apply(context) {
      const app = getApp(context);
      if (app === undefined) return;
      setApp(context, { ...app, round: clearActive(app.round) });
    },
  });

  commands.define("submitGuess", {
    apply(context) {
      const app = getApp(context);
      if (app === undefined) return;
      settle(context, app, submitGuess(app.round));
    },
  });

  commands.define("newGame", {
    apply(context) {
      startRound(context, createRound(freshSeed(), currentOptions(context), "ranked"));
    },
  });

  commands.define("daily", {
    apply(context) {
      const options = currentOptions(context);
      const seed = dailySeed(Date.now(), "codebreaker");
      startRound(context, createRound(seed, options, "daily"));
      pushUrl(shareUrl(seed, options));
    },
  });

  commands.define("toggleDuplicates", {
    apply(context) {
      const options = currentOptions(context);
      startRound(context, createRound(freshSeed(), { ...options, duplicates: !options.duplicates }, "ranked"));
    },
  });

  commands.define("toggleHard", {
    apply(context) {
      const options = currentOptions(context);
      startRound(context, createRound(freshSeed(), { ...options, hard: !options.hard }, "ranked"));
    },
  });
}

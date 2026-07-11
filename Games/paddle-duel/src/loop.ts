import { createRecordBook, type RecordDirection, type RecordStorage } from "@jgengine/core/game/recordBook";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { launchNow, rematch, startMatch, tick, toMenu, togglePause } from "./game/match/controller";
import type { Mode } from "./game/match/state";
import { createMatchState } from "./game/match/state";
import { getMatch, MATCH_KEY, RECORDS_KEY, type RecordField } from "./game/match/store";

const RECORD_BOOK_KEY = "jgengine:paddle-duel:wins";
const RECORD_FIELDS: Readonly<Record<RecordField, RecordDirection>> = {
  easy: "higher",
  medium: "higher",
  hard: "higher",
};

function browserStorage(): RecordStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function serveOrRematch(ctx: GameContext): void {
  const m = getMatch(ctx);
  if (m.phase === "gameover") rematch(ctx);
  else launchNow(ctx);
}

export function onInit(ctx: GameContext): void {
  ctx.game.store.set(MATCH_KEY, createMatchState());
  ctx.game.store.set(
    RECORDS_KEY,
    createRecordBook<RecordField>({ key: RECORD_BOOK_KEY, fields: RECORD_FIELDS, storage: browserStorage() }),
  );

  ctx.game.commands.define<{ mode: Mode }>("setMode", {
    apply: (state, input) => {
      startMatch(state, input.mode);
      return state;
    },
  });
  ctx.game.commands.define<Record<string, never>>("pause", {
    apply: (state) => {
      togglePause(state);
      return state;
    },
  });
  ctx.game.commands.define<Record<string, never>>("serve", {
    apply: (state) => {
      serveOrRematch(state);
      return state;
    },
  });
  ctx.game.commands.define<Record<string, never>>("rematch", {
    apply: (state) => {
      rematch(state);
      return state;
    },
  });
  ctx.game.commands.define<Record<string, never>>("backToMenu", {
    apply: (state) => {
      toMenu(state);
      return state;
    },
  });
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(ctx: GameContext, dt: number): void {
  tick(ctx, dt);
}

import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { Dir } from "./game/logic/board";
import { STORE_KEY, applyMove, createGame, keepPlaying, randomSeed, undoMove, type GameState } from "./game/logic/game";
import { bestScore, recordScore } from "./game/records";
import { readSeedFromLocation, updateLocationSeed } from "./game/share";

function getState(ctx: GameContext): GameState | undefined {
  return ctx.game.store.get(STORE_KEY) as GameState | undefined;
}

function commit(ctx: GameContext, state: GameState): void {
  const best = recordScore(state.score);
  ctx.game.store.set(STORE_KEY, best > state.best ? { ...state, best } : state);
}

function transition(ctx: GameContext, apply: (state: GameState) => GameState): void {
  const state = getState(ctx);
  if (state === undefined) return;
  const next = apply(state);
  if (next !== state) commit(ctx, next);
}

function startNew(ctx: GameContext, seed: string | null, syncUrl: boolean): void {
  const chosen = seed ?? randomSeed();
  if (syncUrl) updateLocationSeed(chosen);
  ctx.game.store.set(STORE_KEY, createGame(chosen, bestScore()));
}

function slideCommand(ctx: GameContext, name: string, dir: Dir): void {
  ctx.game.commands.define(name, {
    apply(state) {
      transition(state, (s) => applyMove(s, dir));
      return state;
    },
  });
}

export function onInit(ctx: GameContext): void {
  slideCommand(ctx, "slideUp", "up");
  slideCommand(ctx, "slideDown", "down");
  slideCommand(ctx, "slideLeft", "left");
  slideCommand(ctx, "slideRight", "right");

  ctx.game.commands.define("undo", {
    apply(state) {
      transition(state, undoMove);
      return state;
    },
  });
  ctx.game.commands.define("keepGoing", {
    apply(state) {
      transition(state, keepPlaying);
      return state;
    },
  });
  ctx.game.commands.define<{ seed?: string }>("newGame", {
    apply(state, input) {
      startNew(state, input?.seed ?? null, true);
      return state;
    },
  });

  const urlSeed = readSeedFromLocation();
  startNew(ctx, urlSeed, urlSeed === null);
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(_ctx: GameContext, _dt: number): void {}

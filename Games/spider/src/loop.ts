import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { readDifficulty, writeDifficulty } from "./game/records";
import { newSeed, seedFromLocation, todaySeed } from "./game/seed";
import {
  applyDeal,
  applyMoveCard,
  applySmart,
  applyUndo,
  newSession,
  STORE_KEY,
  type SeedSource,
  type SpiderSession,
} from "./game/session";
import type { CardSource, MoveTarget, SuitCount } from "./game/spider/engine";

function read(ctx: GameContext): SpiderSession | null {
  return (ctx.game.store.get(STORE_KEY) as SpiderSession | undefined) ?? null;
}

function write(ctx: GameContext, session: SpiderSession): void {
  ctx.game.store.set(STORE_KEY, session);
}

function difficultyOf(ctx: GameContext): SuitCount {
  return read(ctx)?.state.suits ?? readDifficulty();
}

function seedOf(ctx: GameContext): { seed: string; source: SeedSource } {
  const session = read(ctx);
  return session === null
    ? { seed: newSeed(), source: "random" }
    : { seed: session.seed, source: session.seedSource };
}

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define<{ seed: string; seedSource: SeedSource; suits: SuitCount }>("deal", {
    apply: (state, input) => {
      write(state, newSession(input.seed, input.seedSource, input.suits));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("newDeal", {
    apply: (state) => {
      write(state, newSession(newSeed(), "random", difficultyOf(state)));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("dailyDeal", {
    apply: (state) => {
      write(state, newSession(todaySeed(), "daily", difficultyOf(state)));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("restart", {
    apply: (state) => {
      const { seed, source } = seedOf(state);
      write(state, newSession(seed, source, difficultyOf(state)));
      return state;
    },
  });

  ctx.game.commands.define<{ suits: SuitCount }>("setDifficulty", {
    apply: (state, input) => {
      writeDifficulty(input.suits);
      write(state, newSession(newSeed(), "random", input.suits));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("dealStock", {
    apply: (state) => {
      const session = read(state);
      if (session !== null) write(state, applyDeal(session));
      return state;
    },
  });

  ctx.game.commands.define<{ source: CardSource }>("smartMove", {
    apply: (state, input) => {
      const session = read(state);
      if (session !== null) write(state, applySmart(session, input.source));
      return state;
    },
  });

  ctx.game.commands.define<{ source: CardSource; target: MoveTarget }>("moveCard", {
    apply: (state, input) => {
      const session = read(state);
      if (session !== null) write(state, applyMoveCard(session, input.source, input.target));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("undo", {
    apply: (state) => {
      const session = read(state);
      if (session !== null) write(state, applyUndo(session));
      return state;
    },
  });
}

export function onNewPlayer(ctx: GameContext): void {
  const fromUrl = seedFromLocation();
  const seed = fromUrl ?? newSeed();
  const source: SeedSource = fromUrl === null ? "random" : "seed";
  ctx.game.commands.run("deal", { seed, seedSource: source, suits: readDifficulty() });
}

export function onTick(_ctx: GameContext, _dt: number): void {}

import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { newSeed, seedFromLocation, todaySeed } from "./game/seed";
import {
  applyHint,
  applyPick,
  applyReshuffle,
  applyUndo,
  clearHint,
  newSession,
  STORE_KEY,
  type SeedSource,
  type Session,
} from "./game/session";

function read(ctx: GameContext): Session | null {
  return (ctx.game.store.get(STORE_KEY) as Session | undefined) ?? null;
}

function write(ctx: GameContext, session: Session): void {
  ctx.game.store.set(STORE_KEY, session);
}

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define<{ seed: string; source: SeedSource }>("deal", {
    apply: (state, input) => {
      write(state, newSession(input.seed, input.source));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("newDeal", {
    apply: (state) => {
      write(state, newSession(newSeed(), "random"));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("dailyDeal", {
    apply: (state) => {
      write(state, newSession(todaySeed(), "daily"));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("restart", {
    apply: (state) => {
      const session = read(state);
      if (session !== null) write(state, newSession(session.seed, session.source));
      return state;
    },
  });

  ctx.game.commands.define<{ slotId: number }>("pick", {
    apply: (state, input) => {
      const session = read(state);
      if (session !== null) write(state, applyPick(session, input.slotId));
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

  ctx.game.commands.define<Record<string, never>>("hint", {
    apply: (state) => {
      const session = read(state);
      if (session !== null) write(state, applyHint(session));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("clearHint", {
    apply: (state) => {
      const session = read(state);
      if (session !== null) write(state, clearHint(session));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("reshuffle", {
    apply: (state) => {
      const session = read(state);
      if (session !== null) write(state, applyReshuffle(session));
      return state;
    },
  });
}

export function onNewPlayer(ctx: GameContext): void {
  const fromUrl = seedFromLocation();
  const seed = fromUrl ?? newSeed();
  const source: SeedSource = fromUrl === null ? "random" : "seed";
  ctx.game.commands.run("deal", { seed, source });
}

export function onTick(_ctx: GameContext, _dt: number): void {}

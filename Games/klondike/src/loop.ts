import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { CardSource, DrawMode, MoveTarget } from "./game/klondike/engine";
import { newSeed, seedFromLocation, todaySeed } from "./game/seed";
import {
  applyAutoStep,
  applyDraw,
  applyMoveCard,
  applySmart,
  applyUndo,
  newSession,
  STORE_KEY,
  type KlondikeSession,
  type SeedSource,
} from "./game/session";

function read(ctx: GameContext): KlondikeSession | null {
  return (ctx.game.store.get(STORE_KEY) as KlondikeSession | undefined) ?? null;
}

function write(ctx: GameContext, session: KlondikeSession): void {
  ctx.game.store.set(STORE_KEY, session);
}

function drawModeOf(ctx: GameContext): DrawMode {
  return read(ctx)?.state.drawMode ?? 1;
}

function seedOf(ctx: GameContext): { seed: string; source: SeedSource } {
  const session = read(ctx);
  return session === null
    ? { seed: newSeed(), source: "random" }
    : { seed: session.seed, source: session.seedSource };
}

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define<{ seed: string; seedSource: SeedSource; drawMode: DrawMode }>("deal", {
    apply: (state, input) => {
      write(state, newSession(input.seed, input.seedSource, input.drawMode));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("newDeal", {
    apply: (state) => {
      write(state, newSession(newSeed(), "random", drawModeOf(state)));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("dailyDeal", {
    apply: (state) => {
      write(state, newSession(todaySeed(), "daily", drawModeOf(state)));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("restart", {
    apply: (state) => {
      const { seed, source } = seedOf(state);
      write(state, newSession(seed, source, drawModeOf(state)));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("toggleDrawMode", {
    apply: (state) => {
      const { seed, source } = seedOf(state);
      const mode: DrawMode = drawModeOf(state) === 1 ? 3 : 1;
      write(state, newSession(seed, source, mode));
      return state;
    },
  });

  ctx.game.commands.define<Record<string, never>>("draw", {
    apply: (state) => {
      const session = read(state);
      if (session !== null) write(state, applyDraw(session));
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

  ctx.game.commands.define<Record<string, never>>("autoStep", {
    apply: (state) => {
      const session = read(state);
      if (session !== null) write(state, applyAutoStep(session));
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
  ctx.game.commands.run("deal", { seed, seedSource: source, drawMode: 1 });
}

export function onTick(_ctx: GameContext, _dt: number): void {}

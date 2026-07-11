import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seedFromUrl } from "@jgengine/core/random/seedLink";

import { DEFAULT_SIZE_ID, isBoardSizeId, MISMATCH_DELAY_SECONDS } from "./game/match/catalog";
import { flipCard, resolveMismatch } from "./game/match/machine";
import { movesFieldOf, records, timeFieldOf } from "./game/match/records";
import { freshSeed, getRound, newRound, setRound } from "./game/match/round";

function applyNewGame(ctx: GameContext, input: unknown): void {
  const request = (typeof input === "object" && input !== null ? input : {}) as {
    sizeId?: unknown;
    seed?: unknown;
  };
  const current = getRound(ctx);
  const sizeId = isBoardSizeId(request.sizeId) ? request.sizeId : (current?.sizeId ?? DEFAULT_SIZE_ID);
  const seed = typeof request.seed === "string" && request.seed.length > 0 ? request.seed : freshSeed();
  setRound(ctx, newRound(sizeId, seed));
}

function applyFlipCard(ctx: GameContext, input: unknown): void {
  const request = (typeof input === "object" && input !== null ? input : {}) as { index?: unknown };
  if (typeof request.index !== "number") return;
  const round = getRound(ctx);
  if (round === null || round.endedAt !== null) return;

  const match = flipCard(round.match, request.index);
  if (match === round.match) return;

  const now = ctx.time.now();
  const startedAt = round.startedAt ?? now;
  const resolveAt = match.phase === "resolving" ? now + MISMATCH_DELAY_SECONDS : null;
  let endedAt: number | null = null;
  let bests = round.bests;

  if (match.phase === "won") {
    endedAt = now;
    const elapsed = Math.round(Math.max(0, now - startedAt) * 10) / 10;
    bests = records.submit({
      [movesFieldOf(round.sizeId)]: match.moves,
      [timeFieldOf(round.sizeId)]: elapsed,
    });
  }

  setRound(ctx, { ...round, match, startedAt, resolveAt, endedAt, bests });
}

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define("newGame", { apply: applyNewGame });
  ctx.game.commands.define("flipCard", { apply: applyFlipCard });

  const urlSeed = typeof window === "undefined" ? null : seedFromUrl(window.location.href);
  setRound(ctx, newRound(DEFAULT_SIZE_ID, urlSeed ?? freshSeed()));
}

export function onNewPlayer(): void {}

export function onTick(ctx: GameContext): void {
  const round = getRound(ctx);
  if (round === null || round.resolveAt === null) return;
  if (ctx.time.now() < round.resolveAt) return;
  setRound(ctx, { ...round, match: resolveMismatch(round.match), resolveAt: null });
}

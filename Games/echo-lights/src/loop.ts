import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { dailySeed, seedFromUrl } from "@jgengine/core/random/seedLink";

import { isEchoMode, type EchoMode, type PadIndex } from "./game/echo/catalog";
import { idleState, pressPad, startRun, tickEcho } from "./game/echo/machine";
import { BEST_LENGTH_FIELD, records } from "./game/echo/records";
import { freshSeed, getRun, setRun } from "./game/echo/run";

const PAD_COMMANDS: readonly [string, string, string, string] = [
  "padGreen",
  "padRed",
  "padYellow",
  "padBlue",
];

const DAILY_SALT = "echo-lights";

function applyNewGame(ctx: GameContext, input: unknown): void {
  const request = (typeof input === "object" && input !== null ? input : {}) as {
    mode?: unknown;
    seed?: unknown;
    daily?: unknown;
  };
  const run = getRun(ctx);
  const mode: EchoMode = isEchoMode(request.mode) ? request.mode : (run?.mode ?? "classic");
  const seed = typeof request.seed === "string" && request.seed.length > 0 ? request.seed : freshSeed();
  const daily = request.daily === true;
  setRun(ctx, { ...startRun(mode, seed, daily, ctx.time.now()), bests: null });
}

function applyPress(ctx: GameContext, pad: PadIndex): void {
  const run = getRun(ctx);
  if (run === null) return;
  const next = pressPad(run, pad, ctx.time.now());
  if (next === run) return;
  let bests = run.bests;
  if (next.phase === "over" && run.phase !== "over") {
    bests = records.submit({ [BEST_LENGTH_FIELD]: next.completed });
  }
  setRun(ctx, { ...next, bests });
}

function applySetMode(ctx: GameContext, mode: EchoMode): void {
  const run = getRun(ctx);
  if (run === null || run.mode === mode) return;
  if (run.phase === "idle") {
    setRun(ctx, { ...run, mode });
    return;
  }
  setRun(ctx, { ...startRun(mode, freshSeed(), false, ctx.time.now()), bests: null });
}

function applyDaily(ctx: GameContext): void {
  const seed = dailySeed(Date.now(), DAILY_SALT);
  setRun(ctx, { ...startRun("classic", seed, true, ctx.time.now()), bests: null });
}

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define("newGame", { apply: applyNewGame });
  PAD_COMMANDS.forEach((name, pad) => {
    ctx.game.commands.define(name, { apply: (c: GameContext) => applyPress(c, pad as PadIndex) });
  });
  ctx.game.commands.define("setMode", {
    apply: (c: GameContext, input: unknown) => {
      const request = (typeof input === "object" && input !== null ? input : {}) as { mode?: unknown };
      if (isEchoMode(request.mode)) applySetMode(c, request.mode);
    },
  });
  ctx.game.commands.define("toggleMode", {
    apply: (c: GameContext) => {
      const run = getRun(c);
      if (run === null) return;
      applySetMode(c, run.mode === "classic" ? "practice" : "classic");
    },
  });
  ctx.game.commands.define("daily", { apply: applyDaily });

  const urlSeed = typeof window === "undefined" ? null : seedFromUrl(window.location.href);
  setRun(ctx, { ...idleState("classic", urlSeed ?? freshSeed(), false), bests: null });
}

export function onNewPlayer(): void {}

export function onTick(ctx: GameContext): void {
  const run = getRun(ctx);
  if (run === null) return;
  const next = tickEcho(run, ctx.time.now());
  if (next === run) return;
  setRun(ctx, { ...next, bests: run.bests });
}

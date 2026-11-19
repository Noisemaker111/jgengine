import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

export type PlayValue = number | string | boolean | null;

export type PlayMove = "forward" | "back" | "left" | "right";

/** Movement action ids a {@link PlayMove} holds, so a script walks through the same controller a player does. */
export const PLAY_MOVE_ACTIONS: Readonly<Record<PlayMove, string>> = {
  forward: "moveForward",
  back: "moveBack",
  left: "moveLeft",
  right: "moveRight",
};

interface PlayStepBase {
  /** Simulation tick the step starts on. Ticks, not seconds: the run advances one fixed step per tick. */
  tick: number;
  ticks?: number;
  /** Shown in the timeline instead of the generated description. */
  label?: string;
}

export interface PlayMoveStep extends PlayStepBase {
  action: "move";
  move: PlayMove;
}

/** Point the walk controller and the aim payload at a yaw/pitch, in radians. */
export interface PlayAimStep extends PlayStepBase {
  action: "aim";
  yaw: number;
  pitch?: number;
}

export interface PlayFireStep extends PlayStepBase {
  action: "fire";
}

export interface PlayUseStep extends PlayStepBase {
  action: "use";
  actionId: string;
}

export interface PlayWaitStep extends PlayStepBase {
  action: "wait";
  ticks: number;
}

export interface PlayCommandStep extends PlayStepBase {
  action: "command";
  name: string;
  input?: unknown;
}

export type PlayStep = PlayMoveStep | PlayAimStep | PlayFireStep | PlayUseStep | PlayWaitStep | PlayCommandStep;

/**
 * One assertion about world state. Read happens twice — right after `setup` and on the assertion's own
 * tick — so a script can prove change ("health dropped") as well as a level ("wave is 2").
 */
export interface PlayExpectation {
  id: string;
  /** What is being measured, in the game's words. Defaults to {@link PlayExpectation.id}. */
  subject?: string;
  /** Tick to read at. Defaults to the run's final tick. */
  at?: number;
  read: (ctx: GameContext) => PlayValue;
  /** Passes when this is true. Receives the reading at `at` and the reading taken right after `setup`. Default: the reading is truthy. */
  test?: (now: PlayValue, initial: PlayValue) => boolean;
}

/** A script to play against a real game: what to do, on which tick, and what must be true afterwards. */
export interface PlayScript {
  seed: string | number;
  /** Fixed tick length in seconds. Default 1/60. */
  dt: number;
  steps: readonly PlayStep[];
  expect: readonly PlayExpectation[];
  ticks: number;
  totalTicks: number;
  /** Boot work that must happen before the first tick: pick a class, open a wave, spawn the actors the script is about. */
  setup?: (ctx: GameContext, runner: HeadlessRunner) => void;
  /** Called after every tick — a game that needs a decision per tick (send a wave the moment it is ready) writes it as code instead of guessing the tick in advance. Keep it tick-based: read state, run commands, never a clock. */
  onTick?: (ctx: GameContext, tick: number) => void;
}

export interface PlayScriptSpec {
  seed: string | number;
  /** Fixed tick length in seconds. Default 1/60. */
  dt?: number;
  steps?: readonly PlayStep[];
  expect?: readonly PlayExpectation[];
  ticks?: number;
  setup?: (ctx: GameContext, runner: HeadlessRunner) => void;
  onTick?: (ctx: GameContext, tick: number) => void;
}

function requireTick(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`play script: ${what} must be a non-negative whole tick, got ${String(value)}`);
  }
  return value;
}

/** @capability play-script write a game's behaviour as a tick-based script with declarative assertions instead of playing it in a browser */
export function createPlayScript(spec: PlayScriptSpec): PlayScript {
  if (typeof spec.seed !== "string" && typeof spec.seed !== "number") {
    throw new Error("play script: seed must be a string or number so a run can be replayed");
  }
  const dt = spec.dt ?? 1 / 60;
  if (!Number.isFinite(dt) || dt <= 0) throw new Error(`play script: dt must be a positive number of seconds, got ${String(spec.dt)}`);

  const steps = (spec.steps ?? []).map((step, index) => {
    requireTick(step.tick, `step ${index + 1} (${step.action}) tick`);
    const ticks = step.ticks === undefined ? 1 : step.ticks;
    if (!Number.isInteger(ticks) || ticks < 1) {
      throw new Error(`play script: step ${index + 1} (${step.action}) ticks must be a positive whole number, got ${String(step.ticks)}`);
    }
    if (step.action === "use" && step.actionId.trim() === "") {
      throw new Error(`play script: step ${index + 1} needs a non-empty actionId`);
    }
    if (step.action === "command" && step.name.trim() === "") {
      throw new Error(`play script: step ${index + 1} needs a non-empty command name`);
    }
    return { ...step, ticks } as PlayStep;
  });
  steps.sort((left, right) => left.tick - right.tick);

  const expect = (spec.expect ?? []).map((entry, index) => {
    if (entry.id.trim() === "") throw new Error(`play script: expectation ${index + 1} needs an id`);
    if (entry.at !== undefined) requireTick(entry.at, `expectation "${entry.id}" tick`);
    return { ...entry };
  });

  const lastStep = steps.reduce((max, step) => Math.max(max, step.tick + (step.ticks ?? 1)), 0);
  const lastExpect = expect.reduce((max, entry) => Math.max(max, entry.at ?? 0), 0);
  const totalTicks = Math.max(lastStep, lastExpect, spec.ticks ?? 0, 1);

  return { seed: spec.seed, dt, steps, expect, ticks: spec.ticks ?? 0, totalTicks, ...(spec.setup === undefined ? {} : { setup: spec.setup }), ...(spec.onTick === undefined ? {} : { onTick: spec.onTick }) };
}

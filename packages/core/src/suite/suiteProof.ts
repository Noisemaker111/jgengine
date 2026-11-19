import type { ProbeReadings } from "@jgengine/core/game/playableGame";
import type { TeleportTarget } from "@jgengine/core/movement/teleport";
import type { FlowCommandResult, FlowHold, FlowKeys, FlowWaitOptions, ProbeCheck } from "@jgengine/core/play/flow";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { HeadlessPlayable } from "@jgengine/core/runtime/headlessRunner";

/**
 * What a proof's setup may do: anything, cheats included. It seeds the scenario (give items, place the
 * player, spawn a creature, fast-forward the clock). When setup returns, `ctx` and every object reached
 * through it stop working, and so does this handle, so nothing setup kept can write during play.
 */
export interface ProofSetup<TProbe extends ProbeReadings> {
  readonly ctx: GameContext;
  readonly userId: string;
  command(name: string, input?: unknown): void;
  teleport(to: TeleportTarget): void;
  timeScale(scale: number): void;
  hold(keys: FlowKeys, how: FlowHold<TProbe>): void;
  press(keys: FlowKeys): void;
  wait(ms: number): void;
  waitFor(check: ProbeCheck<TProbe>, options?: FlowWaitOptions): TProbe;
  probe(): TProbe;
}

export interface ProofPlay<TProbe extends ProbeReadings> {
  hold(keys: FlowKeys, how: FlowHold<TProbe>): Promise<void>;
  press(keys: FlowKeys): Promise<void>;
  /** Turn to face a heading (radians), as the mouse does. Not an action on its own. */
  heading(yaw: number): Promise<void>;
  act(name: string, input?: unknown): Promise<void>;
  /** As {@link act}, returning a refusal instead of failing, for a step that expects one. */
  tryAct(name: string, input?: unknown): Promise<FlowCommandResult>;
  wait(ms: number): Promise<void>;
  waitFor(check: ProbeCheck<TProbe>, options?: FlowWaitOptions): Promise<TProbe>;
  expect(check: ProbeCheck<TProbe>, note: string): Promise<TProbe>;
  probe(): Promise<TProbe>;
  restart(state?: string): Promise<void>;
}

export interface SuiteProofSpec<TProbe extends ProbeReadings> {
  proves: readonly [string, ...string[]];
  /** A `capture.states` entry to boot into instead of `capture.play`; counts as setup. */
  state?: string;
  setup?(setup: ProofSetup<TProbe>): void | Promise<void>;
  /**
   * The proving steps. At least one of its checks must be false when play starts and true after, so the
   * outcome comes from the player's input, the game's commands or its systems ticking, not from setup.
   */
  play(play: ProofPlay<TProbe>): Promise<void>;
}

export interface SuiteProof<TProbe extends ProbeReadings = ProbeReadings> {
  readonly kind: "jgengine-suite-proof";
  readonly game: HeadlessPlayable<TProbe>;
  readonly proves: readonly string[];
  readonly state: string | undefined;
  readonly setup: SuiteProofSpec<TProbe>["setup"];
  readonly play: SuiteProofSpec<TProbe>["play"];
}

/**
 * Define a game suite proof: a deterministic headless simulation of the real game that proves one or more
 * suite entries. Setup may cheat; play may only do what the player can, and its outcome must be new.
 * The game's suite test runs every proof in `bun test`.
 *
 * @capability suite-proof prove a game suite entry by simulating the real game headless, with setup that may cheat and play that may not
 */
export function defineProof<TProbe extends ProbeReadings>(game: HeadlessPlayable<TProbe>, spec: SuiteProofSpec<TProbe>): SuiteProof<TProbe> {
  return { kind: "jgengine-suite-proof", game, proves: [...spec.proves], state: spec.state, setup: spec.setup, play: spec.play };
}

/** @internal the suite test's loader check */
export function isSuiteProof(value: unknown): value is SuiteProof {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "jgengine-suite-proof";
}

export const CHEAT_COMMAND_NAME = /cheat|debug|admin/i;

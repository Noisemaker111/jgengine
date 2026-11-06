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
  /** The live game context, closed when setup ends. */
  readonly ctx: GameContext;
  readonly userId: string;
  /** Run any command, cheats included; a rejected or unknown one throws. */
  command(name: string, input?: unknown): void;
  /** Move the player (their mount while riding). */
  teleport(to: TeleportTarget): void;
  /** Scale the game clock (1 normal, up to 120). Play always starts back at 1. */
  timeScale(scale: number): void;
  /** Let game time pass with nothing held. */
  wait(ms: number): void;
  /** Tick until the check passes, failing after `timeoutMs` of game time (default 15 000). */
  waitFor(check: ProbeCheck<TProbe>, options?: FlowWaitOptions): TProbe;
  probe(): TProbe;
}

/**
 * What a proof's play phase may do: what a player's input reaches and nothing else. Keys go through the
 * game's bindings, prompts and hotbar; `act` runs the command a button or menu runs. A cheat command,
 * reached any way, fails the proof. Checks read only the game's probe.
 */
export interface ProofPlay<TProbe extends ProbeReadings> {
  hold(keys: FlowKeys, how: FlowHold<TProbe>): Promise<void>;
  press(keys: FlowKeys): Promise<void>;
  /** Turn to face a heading (radians), as the mouse does. Not an action on its own. */
  heading(yaw: number): Promise<void>;
  /** Run the command a UI control runs (`craft`, `learn`, `feed`); a rejection fails the step. */
  act(name: string, input?: unknown): Promise<void>;
  /** As {@link act}, returning a refusal instead of failing, for a step that expects one. */
  tryAct(name: string, input?: unknown): Promise<FlowCommandResult>;
  /** Let game time pass with nothing held: the game's systems tick. */
  wait(ms: number): Promise<void>;
  waitFor(check: ProbeCheck<TProbe>, options?: FlowWaitOptions): Promise<TProbe>;
  expect(check: ProbeCheck<TProbe>, note: string): Promise<TProbe>;
  probe(): Promise<TProbe>;
}

/** A proof as written: the suite entries it proves, its setup, and the play that proves them. */
export interface SuiteProofSpec<TProbe extends ProbeReadings> {
  /** Game suite entry ids (`taming.knockout-melee`) this proof proves. */
  proves: readonly [string, ...string[]];
  /** A `capture.states` entry to boot into instead of `capture.play`; counts as setup. */
  state?: string;
  setup?(setup: ProofSetup<TProbe>): void | Promise<void>;
  /**
   * The proving steps. It must take at least one player action, and at least one of its checks must be
   * false when play starts and true after, so the outcome is the player's doing, not setup's.
   */
  play(play: ProofPlay<TProbe>): Promise<void>;
}

/** A defined proof, as `<game>/proofs/sim/<name>.proof.ts` exports it by default. */
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

/** Whether a module's default export is a {@link SuiteProof}.
 * @internal the suite test's loader check
 */
export function isSuiteProof(value: unknown): value is SuiteProof {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "jgengine-suite-proof";
}

/** Command names a proof treats as cheats even when the game forgot `cheat: true`. */
export const CHEAT_COMMAND_NAME = /cheat|debug|admin/i;

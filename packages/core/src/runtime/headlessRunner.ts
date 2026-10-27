import type { GameDefinition, GameLoop } from "../game/defineGame";
import type { PlayableGameContract, PlayerMovementConfig, VoxelCollisionConfig } from "../game/playableGame";
import type { PointerAxisState } from "../input/pointerAxis";
import {
  resolvePlayerMovementTuning,
  stepPlayerMovement,
  type PlayerMovementTuning,
} from "../movement/playerMovement";
import { shellDrivesPlayerPose } from "../movement/shellMovement";
import type { ModelAssetRef } from "../scene/assetCatalog";
import { advanceBehaviors } from "../scene/behaviorRuntime";
import { createGameContext, type GameContext, type GameContextContent, type GameContextModels } from "./gameContext";
import type { InputFrame, InputSnapshot } from "./inputSnapshot";
import { createContextSimSnapshot, type SimSnapshot } from "./simSnapshot";

/** One step's worth of player intent handed to {@link HeadlessRunner.step} — the held-action set and pointer state the shell would otherwise publish from the browser each frame. */
export interface HeadlessInput {
  /** Discrete presses on this recorded step, including taps released before its held-state sample. */
  presses?: InputFrame["presses"];
  /** Replaces the held-action set for this step; edge detection (`justPressed`/`justReleased`) rolls the previous set forward. Omit to keep the last published set. */
  held?: readonly string[];
  /** Replaces the normalized pointer state; omit to leave the last pointer unchanged (pass `null` to clear it). */
  pointer?: PointerAxisState | null;
}

/** Any playable game, whatever its UI and render types: what `defineGame` returns. */
export type HeadlessPlayable = PlayableGameContract<unknown, unknown, unknown, unknown, unknown, unknown>;

/**
 * Where a headless run gets its game. Pass the whole playable (`game`, what `defineGame` returns) and the runner
 * reads its content, its phase-synced loop, its movement and collision config and whether the shell walks the
 * player, the way play does. Pass a bare `definition` only for a test that builds a partial game; then content,
 * loop, movement and collision are yours to pass, and passing them alongside `game` is a type error.
 */
export type HeadlessGameSource<TAssetRef extends ModelAssetRef, TMultiplayer> =
  | {
      game: HeadlessPlayable;
      definition?: never;
      content?: never;
      loop?: never;
      movement?: never;
      collision?: never;
    }
  | {
      definition: GameDefinition<TAssetRef, TMultiplayer>;
      game?: never;
      /** Catalog resolvers (`entityById`/`objectById`) the context uses; defaults to an empty catalog. */
      content?: GameContextContent;
      /** Lifecycle hooks — `onInit`/`onNewPlayer` fire at construction, `onTick` on every {@link HeadlessRunner.step}. Default: the definition's own loop, which runs its `systems`. */
      loop?: GameLoop<GameContext>;
      /** Movement tuning — pass a direct config to test flight or other movement overrides headlessly. */
      movement?: PlayerMovementConfig;
      /** Voxel collision config (`defineGame({ collision })`) — the shell's walk controller reads it, so pass the same object to walk the same geometry. */
      collision?: VoxelCollisionConfig;
    };

export type HeadlessRunnerOptions<TAssetRef extends ModelAssetRef, TMultiplayer> = HeadlessGameSource<TAssetRef, TMultiplayer> & {
  /** The single local player; defaults to `{ userId: "player", isNew: true }`. */
  player?: { userId: string; isNew: boolean };
  /** Wall-clock source for the sim clock — inject a deterministic counter for reproducible runs. */
  now?: () => number;
  /** Seed for `ctx.rng` — pass one so a recorded run and its replay draw the same numbers. Defaults to the definition's name. */
  seed?: string | number;
  /**
   * Longest slice of time one frame advances, in seconds. Default `0.05`, the shell's frame cap. A longer
   * {@link HeadlessRunner.step} runs as several frames of at most this length, so `step(5)` always advances five
   * seconds; raise it only to skip through long waits in coarser frames.
   */
  maxStepSeconds?: number;
  /**
   * Drive the built-in keyboard player-movement controller from the held-action set each step, exactly as the
   * shell's FrameDriver does. Defaults to what the shell does for this game: on when its input map binds a walk
   * action (`moveForward`, `moveBack`, `moveLeft`, `moveRight`, `jump`), off for games that move their own player.
   */
  playerMovement?: boolean;
  /** Yaw heading (radians) fed to the movement controller when `playerMovement` is on; the shell supplies its camera yaw. Change it mid-run with {@link HeadlessRunner.aim} or the game's own `ctx.camera.turnTo`. */
  heading?: number;
  /** Pitch (radians) fed alongside yaw for 6DOF spectator flight when `alignWithLook` is set. */
  pitch?: number;
  /** Render-model lookup for collider auto-fit — pass what the shell would derive from `entityModels`/`objectModels` so headless raycasts hit the same boxes as play. */
  models?: GameContextModels;
};

/** Canvas-free command/intent surface for {@link HeadlessRunner} — invoke a game's registered UI commands and read the resulting reactive state off `ctx`. */
export interface HeadlessCommandInterface {
  /** Invoke a registered command/intent by name against the live context. Throws on `unknown-command` or a validation rejection so a headless UI-flow test fails loudly instead of silently no-op'ing. */
  invoke(name: string, input?: unknown): void;
  /** Non-throwing {@link invoke} returning the raw command result (inspect `status`). */
  tryInvoke(name: string, input?: unknown): ReturnType<GameContext["game"]["commands"]["run"]>;
  /** Registered command names. */
  names(): string[];
  /** Is a command registered? */
  has(name: string): boolean;
}

/**
 * A renderer-free driver for a game loop: builds a {@link GameContext} from a game, runs the init hooks, then
 * advances the simulation one step at a time from injected input. No React, R3F, or three.js — the whole play path
 * (time, input, `onTick`, behaviour nav, player movement) runs from `core` primitives alone, so a non-React host (a
 * server tick, a test, a CLI replay) can play a real game and read its world snapshot. The shell's FrameDriver is
 * one such driver bolted to `useFrame`; this is the same step distilled out of the render tree.
 *
 * @capability headless-runner play a real game loop with no renderer — tick, feed input, read the world snapshot
 */
export interface HeadlessRunner {
  /** The live game context — read `ctx.scene.entity.list()`, `ctx.game.store`, `ctx.subscribe`/`ctx.version()` for the world snapshot. */
  readonly ctx: GameContext;
  /** The per-frame input the loop reads; the same object exposed as `ctx.input`. */
  readonly input: InputSnapshot;
  readonly userId: string;
  /** The yaw/pitch the walk controller steers by this step: set by {@link aim} or by the game's `ctx.camera.turnTo`. */
  readonly look: Readonly<{ heading: number; pitch: number }>;
  /**
   * Advance the simulation by `dtSeconds` of real time. Publishes `input` (if given), then runs as many frames
   * of at most `maxStepSeconds` as the time needs: each advances the sim clock, runs player movement, then
   * `loop.onTick` and behaviour nav. Returns the total scaled game dt the frames saw.
   */
  step(dtSeconds: number, input?: HeadlessInput): number;
  /** Publish input without advancing — for pre-seeding the held set before the first {@link step}. */
  publishInput(input: HeadlessInput): void;
  /** Drive the game's own UI commands / intents headlessly — the same registry `ctx.game.commands` and the shell's command sink dispatch into. No renderer, no pointer simulation: dispatch an intent, then read reactive state off `ctx`. */
  readonly ui: HeadlessCommandInterface;
  /** Point the movement controller at a yaw/pitch mid-run — what the shell does when the camera turns, so a scripted run can walk one way and then another. */
  aim(look: { heading?: number; pitch?: number }): void;
  /**
   * Capture the whole run for {@link restore}: the game's saved state (`ctx.state()`, every system's save
   * included), the clock, the loop and the rng cursor. With a fixed `simulation.hz` and recorded input,
   * replaying from it reproduces the run exactly.
   */
  snapshot(): SimSnapshot;
  restore(snapshot: SimSnapshot): void;
  /** Current simulation tick (`ctx.sim.tick()`). */
  tick(): number;
}

export function createHeadlessRunner<TAssetRef extends ModelAssetRef, TMultiplayer>(
  options: HeadlessRunnerOptions<TAssetRef, TMultiplayer>,
): HeadlessRunner {
  const playable = options.game;
  const definition: GameDefinition = playable?.game ?? (options.definition as unknown as GameDefinition);
  const content = playable?.content ?? options.content ?? {};
  // A definition's own loop carries its systems; a test that passes no loop still runs them.
  const loop: GameLoop<GameContext> | undefined = playable?.loop ?? options.loop ?? definition.loop;
  const movement = playable?.movement ?? options.movement;
  const collision = playable?.collision ?? options.collision;
  const player = options.player ?? { userId: "player", isNew: true };
  const maxStep = options.maxStepSeconds ?? 0.05;
  if (!(maxStep > 0)) throw new RangeError(`createHeadlessRunner: maxStepSeconds must be positive (got ${maxStep})`);

  const ctx = createGameContext({
    definition,
    content,
    player,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    ...(options.models === undefined ? {} : { models: options.models }),
  });

  loop?.onInit?.(ctx);
  loop?.onNewPlayer?.(ctx);
  const simSnapshot = createContextSimSnapshot(ctx);

  const look = { heading: options.heading ?? 0, pitch: options.pitch ?? 0 };

  const tuning: PlayerMovementTuning | null =
    (options.playerMovement ?? shellDrivesPlayerPose(definition.input))
      ? { ...resolvePlayerMovementTuning({
          collision,
          physics: definition.physics,
          world: definition.world,
          movement,
        }), authoritativeStep: true }
      : null;

  function publishInput(input: HeadlessInput): void {
    ctx.input.publish(input.held ?? ctx.input.held(), { pressed: input.presses?.map(press => press.action) ?? [] });
    if (input.pointer !== undefined) ctx.input.publishPointer(input.pointer);
  }

  /** One frame of at most `maxStep`: the shell's FrameDriver body. */
  function frame(dt: number): number {
    // The shell's camera rig drains a queued turn once per frame and walks along it; headless does the same.
    const turn = ctx.camera.takeTurnTo();
    if (turn !== null) look.heading = turn;
    let total = 0;
    const result = ctx.sim.advance(dt, (stepDt, _tick, gameDt) => {
      ctx.input.beginStep();
      total += gameDt;
      ctx.sim.runStages("beforeMovement", stepDt);
      if (tuning !== null && gameDt > 0) {
        stepPlayerMovement(
          ctx,
          player.userId,
          { held: ctx.input.held(), pointer: ctx.input.pointer() },
          gameDt,
          tuning,
          look.heading,
          look.pitch,
        );
      }
      ctx.sim.runStages("afterMovement", stepDt);
      loop?.onTick?.(ctx, gameDt);
      advanceBehaviors(ctx, gameDt);
      ctx.sim.runStages("afterTick", stepDt);
    });
    if (result.dropped > 0) throw new Error(`headless step dropped ${result.dropped} fixed tick(s); this is a runner bug`);
    return total;
  }

  /** A fixed-rate loop runs at most `maxCatchUpSteps` ticks per advance, so a frame never asks for more. */
  function frameCap(): number {
    const tick = ctx.sim.loop.stepSeconds();
    return tick === null ? maxStep : Math.min(maxStep, tick * ctx.sim.loop.config().maxCatchUpSteps);
  }

  return {
    ctx,
    input: ctx.input,
    userId: player.userId,
    look,
    publishInput,
    ui: {
      invoke(name, input) {
        const result = ctx.game.commands.run(name, input);
        if (result.status === "unknown-command") {
          throw new Error(`headless ui.invoke: unknown command "${name}" — define it via ctx.game.commands.define`);
        }
        if (result.status === "rejected") {
          throw new Error(`headless ui.invoke: command "${name}" rejected — ${result.reason}`);
        }
      },
      tryInvoke: (name, input) => ctx.game.commands.run(name, input),
      names: () => ctx.game.commands.names(),
      has: (name) => ctx.game.commands.has(name),
    },
    aim(next) {
      if (next.heading !== undefined && Number.isFinite(next.heading)) look.heading = next.heading;
      if (next.pitch !== undefined && Number.isFinite(next.pitch)) look.pitch = next.pitch;
    },
    step(dtSeconds, input) {
      if (input !== undefined) publishInput(input);
      if (!(dtSeconds > 0)) return 0;
      const cap = frameCap();
      const frames = Math.ceil(dtSeconds / cap - 1e-9);
      const slice = dtSeconds / frames;
      let total = 0;
      for (let index = 0; index < frames; index += 1) total += frame(slice);
      return total;
    },
    snapshot: () => simSnapshot.capture(),
    restore(snapshot) {
      simSnapshot.restore(snapshot);
      ctx.input.publish([], { reset: true });
    },
    tick: () => ctx.sim.tick(),
  };
}

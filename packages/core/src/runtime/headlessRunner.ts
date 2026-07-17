import type { GameDefinition, GameLoop } from "../game/defineGame";
import type { PointerAxisState } from "../input/pointerAxis";
import {
  resolvePlayerMovementTuning,
  stepPlayerMovement,
  type PlayerMovementTuning,
} from "../movement/playerMovement";
import type { ModelAssetRef } from "../scene/assetCatalog";
import { advanceBehaviors } from "../scene/behaviorRuntime";
import { createGameContext, type GameContext, type GameContextContent } from "./gameContext";
import type { InputSnapshot } from "./inputSnapshot";

/** One step's worth of player intent handed to {@link HeadlessRunner.step} — the held-action set and pointer state the shell would otherwise publish from the browser each frame. */
export interface HeadlessInput {
  /** Replaces the held-action set for this step; edge detection (`justPressed`/`justReleased`) rolls the previous set forward. Omit to keep the last published set. */
  held?: readonly string[];
  /** Replaces the normalized pointer state; omit to leave the last pointer unchanged (pass `null` to clear it). */
  pointer?: PointerAxisState | null;
}

export interface HeadlessRunnerOptions<TAssetRef extends ModelAssetRef, TMultiplayer> {
  definition: GameDefinition<TAssetRef, TMultiplayer>;
  /** Catalog resolvers (`entityById`/`objectById`) the context uses; defaults to an empty catalog. */
  content?: GameContextContent;
  /** Lifecycle hooks — `onInit`/`onNewPlayer` fire at construction, `onTick` on every {@link HeadlessRunner.step}. The shell keeps this separate from `definition` (presentation wraps it); a headless caller passes it directly. */
  loop?: GameLoop<GameContext>;
  /** The single local player; defaults to `{ userId: "player", isNew: true }`. */
  player?: { userId: string; isNew: boolean };
  /** Wall-clock source for the sim clock — inject a deterministic counter for reproducible runs. */
  now?: () => number;
  /** Per-step real-dt clamp in seconds, matching the shell's frame cap so one long stall can't fast-forward the sim. Default `0.05`. */
  maxStepSeconds?: number;
  /**
   * Drive the built-in keyboard player-movement controller from the held-action set each step, exactly as the shell's
   * FrameDriver does for pose-driven games. Off by default — tick-driven games move their own entities inside
   * `onTick` and don't need it.
   */
  playerMovement?: boolean;
  /** Yaw heading (radians) fed to the movement controller when `playerMovement` is on; the shell supplies its camera yaw. */
  heading?: number;
}

/**
 * A renderer-free driver for a game loop: builds a {@link GameContext} from a {@link GameDefinition}, runs the init
 * hooks, then advances the simulation one step at a time from injected input. No React, R3F, or three.js — the whole
 * play path (time, input, `onTick`, behaviour nav, optional player movement) runs from `core` primitives alone, so a
 * non-React host (a server tick, a test, a CLI replay) can play a real game and read its world snapshot. The shell's
 * FrameDriver is one such driver bolted to `useFrame`; this is the same step distilled out of the render tree.
 *
 * @capability headless-runner play a real game loop with no renderer — tick, feed input, read the world snapshot
 */
export interface HeadlessRunner {
  /** The live game context — read `ctx.scene.entity.list()`, `ctx.game.store`, `ctx.subscribe`/`ctx.version()` for the world snapshot. */
  readonly ctx: GameContext;
  /** The per-frame input the loop reads; the same object exposed as `ctx.input`. */
  readonly input: InputSnapshot;
  readonly userId: string;
  /**
   * Advance the simulation one step. Publishes `input` (if given), advances the sim clock by the clamped real dt,
   * runs optional player movement, then `loop.onTick` and behaviour nav. Returns the scaled game dt `onTick` saw.
   */
  step(dtSeconds: number, input?: HeadlessInput): number;
  /** Publish input without advancing — for pre-seeding the held set before the first {@link step}. */
  publishInput(input: HeadlessInput): void;
}

export function createHeadlessRunner<TAssetRef extends ModelAssetRef, TMultiplayer>(
  options: HeadlessRunnerOptions<TAssetRef, TMultiplayer>,
): HeadlessRunner {
  const { definition, loop } = options;
  const content = options.content ?? {};
  const player = options.player ?? { userId: "player", isNew: true };
  const maxStep = options.maxStepSeconds ?? 0.05;

  const ctx = createGameContext({
    definition,
    content,
    player,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  loop?.onInit?.(ctx);
  loop?.onNewPlayer?.(ctx);

  const tuning: PlayerMovementTuning | null =
    options.playerMovement === true
      ? resolvePlayerMovementTuning({ physics: definition.physics, world: definition.world })
      : null;

  function publishInput(input: HeadlessInput): void {
    if (input.held !== undefined) ctx.input.publish(input.held);
    if (input.pointer !== undefined) ctx.input.publishPointer(input.pointer);
  }

  return {
    ctx,
    input: ctx.input,
    userId: player.userId,
    publishInput,
    step(dtSeconds, input) {
      if (input !== undefined) publishInput(input);
      const dt = Math.min(dtSeconds, maxStep);
      const gameDt = ctx.time.advance(dt);
      if (tuning !== null) {
        stepPlayerMovement(
          ctx,
          player.userId,
          { held: ctx.input.held(), pointer: ctx.input.pointer() },
          dt,
          tuning,
          options.heading,
        );
      }
      loop?.onTick?.(ctx, gameDt);
      advanceBehaviors(ctx, gameDt);
      return gameDt;
    },
  };
}

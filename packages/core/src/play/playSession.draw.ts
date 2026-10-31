import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { HeadlessPlayable } from "@jgengine/core/runtime/headlessRunner";

import type { InputRecorder } from "@jgengine/core/replay/inputReplay";

import { dispatchBoundAction, RESERVED_INPUT_ACTIONS, shouldFireBoundAction } from "../input/boundActionDispatch";
import { executeHotbarSlot, findHotbarSlotActions, hotbarIdFor } from "../input/hotbarActions";

/** Options for {@link createPlaySession}. */
export interface PlaySessionOptions {
  /** Local player id. Default `"player"`. */
  userId?: string;
  /** Seed for `ctx.rng`. */
  seed?: string | number;
  /** Seconds per tick. Default 1/60. */
  dt?: number;
  /** Called for every command the session runs (a bound action, a prompt, or {@link PlaySession.command}). */
  onCommand?: (entry: { name: string; input: unknown; label: string; result: ReturnType<GameContext["game"]["commands"]["run"]> }) => void;
  /** Records every tick and every {@link PlaySession.command} call, for a replay. Bound-action commands replay from the input and are not recorded. */
  recorder?: InputRecorder;
}

/** A live headless play of one game, ticked by its caller. */
export interface PlaySession {
  readonly runner: HeadlessRunner;
  readonly ctx: GameContext;
  readonly userId: string;
  readonly dt: number;
  /** Milliseconds of game time the session has run. */
  readonly clockMs: number;
  /**
   * One tick with these actions held, then the shell's action phase on it: a pressed (or repeating) bound
   * action runs its command with the aim, `interact` runs the active proximity prompt, a hotbar press uses
   * its slot.
   */
  tick(held: readonly string[], dt?: number): void;
  /** Run a command as the player would, reported through `onCommand`. */
  command(name: string, input?: unknown, label?: string): ReturnType<GameContext["game"]["commands"]["run"]>;
}

/**
 * Boot a `PlayableGame` through the headless runner and tick it the way the shell does: movement from
 * held actions, then the per-frame action phase (bound commands, prompts, hotbar). The aim a command
 * receives is the walk heading, so a `ctx.camera.turnTo` from the game or the caller steers both.
 *
 * @capability play-session tick a real game headless the way the shell does, with held actions, prompts and hotbar
 */
export function createPlaySession(playable: HeadlessPlayable, options: PlaySessionOptions = {}): PlaySession {
  const definition = playable.game;
  const dt = options.dt ?? 1 / 60;
  const userId = options.userId ?? "player";
  let clockMs = 0;
  const runner = createHeadlessRunner({
    game: playable,
    player: { userId, isNew: true },
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    now: () => clockMs,
    maxStepSeconds: dt,
  });
  const ctx = runner.ctx;

  const run = (name: string, input?: unknown, label = `command ${name}`) => {
    const result = ctx.game.commands.run(name, input);
    options.onCommand?.({ name, input, label, result });
    return result;
  };

  const repeatFiredAt = new Map<string, number>();
  const gameActions = Object.keys(definition.input ?? {});
  const slotActions = findHotbarSlotActions(definition.input);
  const hotbarId = hotbarIdFor(playable);
  const sink = { run: (name: string, input: unknown) => void run(name, input, `action ${name}`) };

  const dispatchActions = (): void => {
    const { heading: yaw, pitch } = runner.look;
    const isDown = (action: string): boolean => ctx.input.isDown(action);
    const wasPressed = (action: string): boolean => ctx.input.justPressed(action);
    const tracker = { isDown, wasPressed };
    for (const action of gameActions) {
      if (action === "interact") {
        if (!wasPressed(action)) continue;
        const prompts = playable.prompts?.(ctx) ?? [];
        const focus = ctx.scene.entity.get(userId);
        if (prompts.length === 0 || focus === null) continue;
        const active = resolveActivePrompt({ x: focus.position[0], z: focus.position[2] }, prompts);
        if (active?.prompt.invoke != null) run(active.prompt.invoke.name, active.prompt.invoke.input, `prompt ${active.id}`);
        continue;
      }
      if (!shouldFireBoundAction(tracker, action, definition.input, repeatFiredAt, clockMs)) continue;
      repeatFiredAt.set(action, clockMs);
      dispatchBoundAction(ctx, action, yaw, pitch, { yaw, pitch }, RESERVED_INPUT_ACTIONS, sink, !wasPressed(action));
    }
    if (hotbarId !== null) {
      for (const { action, slot } of slotActions) {
        if (!wasPressed(action)) continue;
        executeHotbarSlot(ctx, userId, hotbarId, slot, yaw, pitch);
      }
      if (wasPressed("useAbility")) {
        const slots = ctx.player.inventory.state(hotbarId).slots;
        const preferred = playable.hotbarSelection?.() ?? -1;
        const slot = preferred >= 0 && slots[preferred] != null ? preferred : slots.findIndex((stack) => stack != null);
        if (slot >= 0) executeHotbarSlot(ctx, userId, hotbarId, slot, yaw, pitch);
      }
    }
  };

  let ticks = 0;
  // Ticks at the session's own dt are counted, so a fixed-step clock never drifts; others add their time.
  let otherMs = 0;
  let previousHeld: readonly string[] = [];
  const recorder = options.recorder;
  return {
    runner,
    ctx,
    userId,
    dt,
    get clockMs() {
      return clockMs;
    },
    tick(held, stepDt = dt) {
      if (recorder !== undefined) {
        const pressed = held.filter((action) => !previousHeld.includes(action));
        recorder.frame({ dt: stepDt, held, pressed, yaw: runner.look.heading, pitch: runner.look.pitch });
        previousHeld = [...held];
      }
      if (stepDt === dt) ticks += 1;
      else otherMs += stepDt * 1000;
      clockMs = Math.round((ticks * dt * 1000 + otherMs) * 1000) / 1000;
      runner.step(stepDt, { held: [...held], pointer: null });
      dispatchActions();
    },
    command(name, input, label) {
      recorder?.command(name, input);
      return run(name, input, label);
    },
  };
}

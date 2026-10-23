import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { Aim } from "@jgengine/core/scene/spatial";

import { dispatchBoundAction, RESERVED_INPUT_ACTIONS, shouldFireBoundAction } from "../boundActionDispatch";
import { executeHotbarSlot, findHotbarSlotActions, hotbarIdFor } from "../hotbarActions";
import type { PlayableGame } from "../registry";
import { shellDrivesPlayerPose } from "../shellMovement";
import {
  createPlayScript,
  PLAY_MOVE_ACTIONS,
  type PlayScript,
  type PlayScriptSpec,
  type PlayStep,
  type PlayValue,
} from "./script";
import { playTimelineDigest, type PlayExpectationResult, type PlayRunResult, type PlayTimelineEntry } from "./timeline";

/** Options for one scripted play run. */
export interface PlayRunOptions {
  /** Local player id the script acts as. Default `"player"`. */
  userId?: string;
  /** Override the script's fixed tick length, in seconds. */
  dt?: number;
  /** Stop recording world events after this many rows so a long run stays readable. Default 1000. */
  maxEvents?: number;
  /** Called after `setup` and after every tick, for a script that wants to watch the run (progress bars, debug output). */
  onTick?: (tick: number, ctx: GameContext) => void;
}

const RECORDED_EVENTS = [
  "combat.damage",
  "entity.died",
  "stat.levelUp",
  "quest.accepted",
  "quest.updated",
  "quest.completed",
  "loot.granted",
  "worldItem.dropped",
  "feedback.cue",
  "command.refused",
] as const;

interface HeldWindow {
  action: string;
  from: number;
  to: number;
}

function stepLabel(step: PlayStep): string {
  if (step.label !== undefined) return step.label;
  switch (step.action) {
    case "move":
      return `move ${step.move} ×${step.ticks ?? 1}`;
    case "fire":
      return `fire ×${step.ticks ?? 1}`;
    case "aim":
      return `aim yaw=${step.yaw.toFixed(3)}${step.pitch === undefined ? "" : ` pitch=${step.pitch.toFixed(3)}`}`;
    case "use":
      return `use ${step.actionId}`;
    case "wait":
      return `wait ×${step.ticks ?? 1}`;
    case "command":
      return `command ${step.name}`;
  }
}

function eventValues(name: (typeof RECORDED_EVENTS)[number], payload: unknown): Record<string, number | string | boolean | null> {
  const record = payload as Record<string, unknown>;
  switch (name) {
    case "combat.damage":
      return {
        to: String(record.target ?? ""),
        ...(record.source === undefined ? {} : { from: String(record.source) }),
        amount: typeof record.amount === "number" ? Math.round(record.amount * 100) / 100 : null,
        remaining: typeof record.remaining === "number" ? Math.round(record.remaining * 100) / 100 : null,
        ...(record.lethal === true ? { lethal: true } : {}),
      };
    case "entity.died":
      return { id: String(record.instanceId ?? ""), kind: String(record.catalogId ?? "") };
    case "stat.levelUp":
      return { user: String(record.userId ?? ""), stat: String(record.stat ?? "") };
    case "quest.accepted":
    case "quest.completed":
      return { quest: String(record.questId ?? "") };
    case "quest.updated":
      return {
        quest: String(record.questId ?? ""),
        ...(record.objectiveId === undefined ? {} : { objective: String(record.objectiveId) }),
        ...(record.progress === undefined ? {} : { progress: Number(record.progress) }),
      };
    case "loot.granted":
      return { item: String(record.itemId ?? record.lootId ?? ""), ...(record.amount === undefined ? {} : { amount: Number(record.amount) }) };
    case "worldItem.dropped":
      return { item: String(record.itemId ?? "") };
    case "feedback.cue":
      return { cue: String(record.cue ?? "") };
    case "command.refused":
      return { command: String(record.command ?? ""), reason: String(record.reason ?? "") };
  }
}

/**
 * Play a real game without a browser: boot its `PlayableGame` through the headless runner, apply a
 * tick-based {@link PlayScript}, and return what happened plus whether the script's assertions held.
 *
 * Runs the shell's own per-tick pipeline, not an imitation of it — held movement actions reach the walk
 * controller, a held `fire` (or any game action) resolves to its bound command on the press tick and on
 * its repeat cadence, `interact` picks the active proximity prompt, and a hotbar press activates the
 * slot. So a script proves the same code path a player's hands prove, in seconds.
 *
 * @capability play-script play a real game from a deterministic script — spawn, move, aim, fire, command, and assert world state with no browser and no wall clock
 */
export function runPlayScript(
  playable: PlayableGame,
  spec: PlayScript | PlayScriptSpec,
  options: PlayRunOptions = {},
): PlayRunResult {
  const script: PlayScript = createPlayScript(spec);
  const definition = playable.game;
  const dt = options.dt ?? script.dt;
  const maxEvents = options.maxEvents ?? 1000;

  let clockMs = 0;
  const runner: HeadlessRunner = createHeadlessRunner({
    definition,
    content: playable.content,
    loop: playable.loop,
    player: { userId: options.userId ?? "player", isNew: true },
    seed: script.seed,
    now: () => clockMs,
    maxStepSeconds: dt,
    playerMovement: shellDrivesPlayerPose(definition.input),
    movement: playable.movement,
    collision: playable.collision,
  });
  const ctx = runner.ctx;
  const playerId = options.userId ?? "player";

  const timeline: PlayTimelineEntry[] = [];
  let eventRows = 0;
  let truncated = false;
  const record = (entry: PlayTimelineEntry): void => {
    if (entry.kind === "event") {
      eventRows += 1;
      if (eventRows > maxEvents) {
        if (!truncated) {
          truncated = true;
          timeline.push({ tick: entry.tick, kind: "event", label: "timeline truncated", values: { maxEvents } });
        }
        return;
      }
    }
    timeline.push(entry);
  };

  for (const name of RECORDED_EVENTS) {
    ctx.game.events.on(name, (payload: unknown) => {
      record({ tick: runner.tick(), kind: "event", label: name, values: eventValues(name, payload) });
    });
  }

  /** Run a command and record its verdict once, at the tick it ran. */
  const runCommand = (name: string, input?: unknown, label = `command ${name}`): void => {
    const result = ctx.game.commands.run(name, input);
    record({
      tick: runner.tick(),
      kind: "command",
      label,
      values: {
        status: result.status,
        ...(result.status === "rejected" && "reason" in result && result.reason !== undefined ? { reason: String(result.reason) } : {}),
      },
    });
  };

  let yaw = 0;
  let pitch = 0;
  const heldWindows: HeldWindow[] = [];

  const stepHolds = (step: PlayStep): string | null => {
    if (step.action === "move") return PLAY_MOVE_ACTIONS[step.move];
    if (step.action === "fire") return "fire";
    if (step.action === "use") return step.actionId;
    return null;
  };

  for (const step of script.steps) {
    const action = stepHolds(step);
    if (action !== null) heldWindows.push({ action, from: step.tick, to: step.tick + (step.ticks ?? 1) });
  }

  if (script.setup !== undefined) script.setup(ctx, runner);

  const sample = (expectation: PlayScript["expect"][number], tick: number): PlayExpectationResult => {
    const value = expectation.read(ctx);
    const initial = initialReadings.get(expectation.id) ?? value;
    const pass = expectation.test === undefined ? Boolean(value) : expectation.test(value, initial);
    record({
      tick,
      kind: "check",
      label: expectation.id,
      values: { value, initial, pass },
    });
    return { id: expectation.id, subject: expectation.subject ?? expectation.id, tick, pass, initial, value };
  };

  const initialReadings = new Map<string, PlayValue>();
  for (const expectation of script.expect) {
    if (expectation.at === undefined || expectation.at > 0) initialReadings.set(expectation.id, expectation.read(ctx));
  }

  const results: PlayExpectationResult[] = [];
  for (const expectation of script.expect) {
    if (expectation.at === 0) results.push(sample(expectation, 0));
  }
  const repeatFiredAt = new Map<string, number>();
  const gameActions = Object.keys(definition.input ?? {});
  const slotActions = findHotbarSlotActions(definition.input);
  const hotbarId = hotbarIdFor(playable);
  const sink = { run: (name: string, input: unknown) => runCommand(name, input, `action ${name}`) };
  const commandAim = (): Aim => ({ yaw, pitch });

  /** The shell's per-frame action phase: bound commands, prompts, hotbar — run after the tick it belongs to. */
  const dispatchActions = (): void => {
    const isDown = (action: string): boolean => ctx.input.isDown(action);
    const wasPressed = (action: string): boolean => ctx.input.justPressed(action);
    const tracker = { isDown, wasPressed };
    for (const action of gameActions) {
      if (action === "interact") {
        if (!wasPressed(action)) continue;
        const prompts = playable.prompts?.(ctx) ?? [];
        const focus = ctx.scene.entity.get(playerId);
        if (prompts.length === 0 || focus === null) continue;
        const active = resolveActivePrompt({ x: focus.position[0], z: focus.position[2] }, prompts);
        if (active?.prompt.invoke != null) runCommand(active.prompt.invoke.name, active.prompt.invoke.input, `prompt ${active.id}`);
        continue;
      }
      if (!shouldFireBoundAction(tracker, action, definition.input, repeatFiredAt, clockMs)) continue;
      repeatFiredAt.set(action, clockMs);
      dispatchBoundAction(ctx, action, yaw, pitch, commandAim(), RESERVED_INPUT_ACTIONS, sink);
    }
    if (hotbarId !== null) {
      for (const { action, slot } of slotActions) {
        if (!wasPressed(action)) continue;
        executeHotbarSlot(ctx, playerId, hotbarId, slot, yaw, pitch);
      }
      if (wasPressed("useAbility")) {
        const slots = ctx.player.inventory.state(hotbarId).slots;
        const preferred = playable.hotbarSelection?.() ?? -1;
        const slot = preferred >= 0 && slots[preferred] != null ? preferred : slots.findIndex((stack) => stack != null);
        if (slot >= 0) executeHotbarSlot(ctx, playerId, hotbarId, slot, yaw, pitch);
      }
    }
  };

  const stepsByTick = new Map<number, PlayStep[]>();
  for (const step of script.steps) {
    const bucket = stepsByTick.get(step.tick) ?? [];
    bucket.push(step);
    stepsByTick.set(step.tick, bucket);
  }

  for (let tick = 0; tick < script.totalTicks; tick += 1) {
    for (const step of stepsByTick.get(tick) ?? []) {
      record({ tick, kind: "step", label: stepLabel(step), values: { action: step.action, ticks: step.ticks ?? 1 } });
      if (step.action === "command") runCommand(step.name, step.input);
      if (step.action === "aim") {
        yaw = step.yaw;
        if (step.pitch !== undefined) pitch = step.pitch;
        runner.aim({ heading: yaw, pitch });
      }
    }

    const held = heldWindows.filter((window) => tick >= window.from && tick < window.to).map((window) => window.action);
    clockMs = Math.round((tick + 1) * dt * 1000 * 1000) / 1000;
    runner.step(dt, { held, pointer: null });
    dispatchActions();
    script.onTick?.(ctx, runner.tick());
    options.onTick?.(runner.tick(), ctx);

    const nowTick = runner.tick();
    for (const expectation of script.expect) {
      if (expectation.at === nowTick) results.push(sample(expectation, nowTick));
    }
  }

  const finalTick = runner.tick();
  for (const expectation of script.expect) {
    if (expectation.at === undefined) results.push(sample(expectation, finalTick));
  }

  return {
    seed: script.seed,
    dt,
    ticks: finalTick,
    timeline,
    expectations: results,
    passed: results.every((result) => result.pass),
    digest: playTimelineDigest(timeline),
  };
}

// @skill jgengine-ui
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PlayableGame } from "@jgengine/shell/registry";

import { createPlaySession } from "./playSession.draw";
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
  const dt = options.dt ?? script.dt;
  const maxEvents = options.maxEvents ?? 1000;
  const session = createPlaySession(playable, {
    userId: options.userId ?? "player",
    seed: script.seed,
    dt,
    onCommand: ({ label, result }) =>
      record({
        tick: runner.tick(),
        kind: "command",
        label,
        values: {
          status: result.status,
          ...(result.status === "rejected" && "reason" in result && result.reason !== undefined ? { reason: String(result.reason) } : {}),
        },
      }),
  });
  const runner = session.runner;
  const ctx = session.ctx;

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
  const stepsByTick = new Map<number, PlayStep[]>();
  for (const step of script.steps) {
    const bucket = stepsByTick.get(step.tick) ?? [];
    bucket.push(step);
    stepsByTick.set(step.tick, bucket);
  }

  for (let tick = 0; tick < script.totalTicks; tick += 1) {
    for (const step of stepsByTick.get(tick) ?? []) {
      record({ tick, kind: "step", label: stepLabel(step), values: { action: step.action, ticks: step.ticks ?? 1 } });
      if (step.action === "command") session.command(step.name, step.input);
      if (step.action === "aim") runner.aim({ heading: step.yaw, ...(step.pitch === undefined ? {} : { pitch: step.pitch }) });
    }

    const held = heldWindows.filter((window) => tick >= window.from && tick < window.to).map((window) => window.action);
    session.tick(held);
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

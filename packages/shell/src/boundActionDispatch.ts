import {
  actionRepeatMs,
  resolveActionCommand,
  shouldDispatchAction,
  type ActionStateTracker,
} from "@jgengine/core/input/actionBindings";
import type { Aim } from "@jgengine/core/scene/spatial";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

import { localCommandSink, type CommandSink } from "./commandSink";

/** Actions the shell consumes natively and never routes to a same-named command. */
export const RESERVED_INPUT_ACTIONS: ReadonlySet<string> = new Set([
  "moveForward",
  "moveBack",
  "moveLeft",
  "moveRight",
  "turnLeft",
  "turnRight",
  "sprint",
  "jump",
  "tabTarget",
  "clearTarget",
  "useAbility",
  "interact",
]);

/** Actions from `input` currently held down, for `ctx.input.publish` (#164.1); includes reserved movement/jump actions. */
export function heldActionsFor(
  tracker: Pick<ActionStateTracker<string>, "isDown">,
  actions: readonly string[],
): string[] {
  return actions.filter((action) => tracker.isDown(action));
}

/** Whether a bound action should fire this frame: on press, or on repeat interval while held (shared by `FrameDriver` and `HudOnlyDriver`). */
export function shouldFireBoundAction(
  tracker: Pick<ActionStateTracker<string>, "isDown" | "wasPressed">,
  action: string,
  input: ActionCodesMap | undefined,
  repeatFiredAt: ReadonlyMap<string, number>,
  now: number,
): boolean {
  return shouldDispatchAction({
    pressed: tracker.wasPressed(action),
    down: tracker.isDown(action),
    repeatMs: actionRepeatMs(input?.[action]),
    lastFiredAt: repeatFiredAt.get(action) ?? null,
    now,
  });
}

/** Resolves and runs the command bound to `action` via the shell's action→command convention (shared by `FrameDriver` and `HudOnlyDriver`). */
export function dispatchBoundAction(
  ctx: GameContext,
  action: string,
  yaw: number,
  pitch: number,
  aim: Aim,
  reserved: ReadonlySet<string> = RESERVED_INPUT_ACTIONS,
  sink: CommandSink = localCommandSink(ctx),
): void {
  const command = resolveActionCommand(action, (name) => ctx.game.commands.has(name), reserved);
  if (command !== null) sink.run(command, { yaw, pitch, aim });
}

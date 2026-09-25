import {
  resolveGamepadFrame,
  type GamepadBindings,
  type GamepadCode,
  type GamepadFrame,
  type GamepadSample,
  type ResolveGamepadFrameOptions,
} from "@jgengine/core/input/gamepadModel";
import type { ActionCodesMap, ActionStateTracker } from "@jgengine/core/input/actionBindings";

/** Buffers one shell gamepad poll reuses across frames. */
export interface GamepadPoll {
  held: Set<string>;
  nextHeld: Set<string>;
  frame: GamepadFrame;
  merged: Record<string, number>;
  base: Readonly<Record<string, number>> | null;
}

/** Fresh buffers for {@link stepGamepadPoll}. */
export function emptyGamepadPoll(): GamepadPoll {
  return { held: new Set(), nextHeld: new Set(), frame: { held: [], analog: {} }, merged: {}, base: null };
}

/** The pad-only slice of an action binding map, in the shape {@link resolveGamepadFrame} reads. */
export function gamepadCodes(bindings: ActionCodesMap): GamepadBindings {
  const result: Record<string, GamepadCode[]> = {};
  for (const [action, config] of Object.entries(bindings)) {
    const codes = Array.isArray(config)
      ? config
      : [...((config as { hold?: readonly string[] }).hold ?? []), ...((config as { toggle?: readonly string[] }).toggle ?? [])];
    const padCodes = codes.filter((code) => code.startsWith("pad:") || code.startsWith("padaxis:")) as GamepadCode[];
    if (padCodes.length > 0) result[action] = padCodes;
  }
  return result;
}

function syncTracker(tracker: ActionStateTracker<string>, bindings: GamepadBindings, previous: Set<string>, next: Set<string>) {
  for (const action in bindings) {
    const wasDown = previous.has(action);
    const isDown = next.has(action);
    if (isDown === wasDown) continue;
    for (const code of bindings[action] as readonly GamepadCode[]) {
      if (isDown) tracker.handleDown(code);
      else tracker.handleUp(code);
    }
  }
}

/**
 * Swap the pad bindings mid-game (a context push) without touching keyboard state: release the codes
 * of pad-held actions whose pad codes changed (the next poll presses them under the new map), and
 * keep the rest held.
 */
export function rebindGamepadPoll(
  poll: GamepadPoll,
  previous: GamepadBindings,
  next: GamepadBindings,
  tracker: ActionStateTracker<string>,
): void {
  for (const action of poll.held) {
    const before = (previous[action] ?? []) as readonly GamepadCode[];
    const after = next[action] as readonly GamepadCode[] | undefined;
    if (after !== undefined && after.length === before.length && after.every((code, index) => code === before[index])) continue;
    for (const code of before) tracker.handleUp(code);
    poll.held.delete(action);
  }
}

/**
 * One poll: resolve every connected pad, press/release tracker codes for actions whose pad state
 * changed, and return the analog map to publish (pad values max-merged over the other source's).
 * Allocation-free after the first frame.
 */
export function stepGamepadPoll(
  poll: GamepadPoll,
  pads: ArrayLike<GamepadSample | null | undefined>,
  bindings: GamepadBindings,
  options: ResolveGamepadFrameOptions,
  tracker: ActionStateTracker<string>,
  analogIn: Readonly<Record<string, number>> | null,
): Readonly<Record<string, number>> | null {
  // The analog slot is shared with the touch dock: anything other than our own merged record is a
  // fresh touch publish (or null) and becomes the base the pad values merge over.
  if (analogIn !== poll.merged) poll.base = analogIn;
  const merged = poll.merged;
  for (const key in merged) delete merged[key];
  let any = false;
  if (poll.base !== null) {
    for (const action in poll.base) {
      merged[action] = poll.base[action];
      any = true;
    }
  }
  const nextHeld = poll.nextHeld;
  nextHeld.clear();
  for (let index = 0; index < pads.length; index += 1) {
    const pad = pads[index];
    if (pad === null || pad === undefined) continue;
    const frame = resolveGamepadFrame(pad, bindings, options, poll.frame);
    for (const action of frame.held) nextHeld.add(action);
    for (const action in frame.analog) {
      const value = frame.analog[action];
      if (value > (merged[action] ?? 0)) {
        merged[action] = value;
        any = true;
      }
    }
  }
  syncTracker(tracker, bindings, poll.held, nextHeld);
  poll.nextHeld = poll.held;
  poll.held = nextHeld;
  return any ? merged : null;
}

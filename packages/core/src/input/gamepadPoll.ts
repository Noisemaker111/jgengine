import {
  resolveGamepadFrame,
  type GamepadBindings,
  type GamepadCode,
  type GamepadFrame,
  type GamepadSample,
  type ResolveGamepadFrameOptions,
} from "@jgengine/core/input/gamepadModel";
import type { ActionCodesMap, ActionStateTracker } from "@jgengine/core/input/actionBindings";
import type { LocalPlayerSlot, LocalPlayers } from "@jgengine/core/runtime/localPlayers";

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

/** Where each connected pad's input goes this frame; buffers are reused across frames. */
export interface GamepadRoute {
  /** Pads driving the primary player, by pad index (`null` for pads routed elsewhere). */
  primary: (GamepadSample | null)[];
  /** Pads driving another local seat; entries past `seatCount` are stale pooled slots. */
  seats: { slotId: string; pad: GamepadSample }[];
  seatCount: number;
  /** Seats opened this frame. */
  joined: LocalPlayerSlot[];
}

/** Fresh buffers for {@link routeGamepads}. */
export function emptyGamepadRoute(): GamepadRoute {
  return { primary: [], seats: [], seatCount: 0, joined: [] };
}

function anyButtonPressed(pad: GamepadSample): boolean {
  for (let index = 0; index < pad.buttons.length; index += 1) {
    if (pad.buttons[index]?.pressed === true) return true;
  }
  return false;
}

/**
 * Route pads to local seats: a claimed pad goes to its seat, an unclaimed pad hot-joins on a button
 * press (stick drift never opens a seat), and with one seat every pad drives the primary player.
 */
export function routeGamepads(
  pads: ArrayLike<GamepadSample | null | undefined>,
  seats: Pick<LocalPlayers, "assign" | "slotForDevice" | "config">,
  route: GamepadRoute,
): GamepadRoute {
  route.primary.length = pads.length;
  route.seatCount = 0;
  route.joined.length = 0;
  const single = seats.config().maxSlots === 1;
  for (let index = 0; index < pads.length; index += 1) {
    route.primary[index] = null;
    const pad = pads[index];
    if (pad === null || pad === undefined || !pad.connected) continue;
    const deviceId = `gamepad:${index}`;
    let slot = seats.slotForDevice(deviceId);
    if (slot === null && (single || anyButtonPressed(pad))) {
      const assigned = seats.assign(deviceId);
      if (assigned !== null) {
        slot = assigned.slot;
        if (assigned.joined) route.joined.push(slot);
      }
    }
    if (slot === null) continue;
    if (slot.index === 0) route.primary[index] = pad;
    else {
      const entry = route.seats[route.seatCount];
      if (entry === undefined) route.seats.push({ slotId: slot.slotId, pad });
      else {
        entry.slotId = slot.slotId;
        entry.pad = pad;
      }
      route.seatCount += 1;
    }
  }
  return route;
}

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

import {
  gamepadFeelOptions,
  resolveGamepadFrame,
  type GamepadFeelConfig,
  type GamepadFrame,
  type GamepadSample,
} from "@jgengine/core/input/gamepadModel";
import type { LocalPlayerSlot, LocalPlayers } from "@jgengine/core/runtime/localPlayers";
import type { ActionCodesMap, ActionStateTracker } from "@jgengine/core/input/actionBindings";
import type { InputSnapshot } from "@jgengine/core/runtime/inputSnapshot";
import {
  emptyGamepadPoll,
  emptyGamepadRoute,
  gamepadCodes,
  rebindGamepadPoll,
  routeGamepads,
  stepGamepadPoll,
} from "./gamepadPoll";
import { PAD_HAPTIC_EFFECT_MS, emptyPadHapticState, stepPadHaptics, type PadHapticState } from "./padHaptics";
export { mergeGamepadFrame, mergeGamepadInput } from "./gamepadMerge";

const NO_PADS: readonly (Gamepad | null)[] = [];

function browserPads(): ArrayLike<Gamepad | null> {
  return typeof navigator === "undefined" || navigator.getGamepads === undefined ? NO_PADS : navigator.getGamepads();
}

function actuatorOf(pad: GamepadSample | Gamepad | null | undefined): GamepadHapticActuator | null {
  return pad === null || pad === undefined || !("vibrationActuator" in pad) ? null : (pad.vibrationActuator ?? null);
}

function ignore(): void {}

/** Pad index a user's rumble goes to: their seat's pad, else the first connected pad for the primary seat. */
function padIndexForUser(userId: string, seats: LocalPlayers | undefined, pads: ArrayLike<GamepadSample | null>): number {
  const legacy = /^gamepad:(\d+)$/.exec(userId)?.[1];
  if (legacy !== undefined) return Number(legacy);
  const slot = seats?.slots().find((candidate) => candidate.userId === userId);
  const claimed = slot?.deviceId === null || slot?.deviceId === undefined ? undefined : /^gamepad:(\d+)$/.exec(slot.deviceId)?.[1];
  if (claimed !== undefined) return Number(claimed);
  if (slot !== undefined && slot.index !== 0) return -1;
  for (let index = 0; index < pads.length; index += 1) {
    if (pads[index]?.connected === true) return index;
  }
  return -1;
}

const NO_HELD: readonly string[] = [];

function hasAnalog(analog: Readonly<Record<string, number>>): boolean {
  for (const _ in analog) return true;
  return false;
}
// `?gamepad` (or `?gamepad=N` for N pads) injects synthetic pads holding button 0, since headless
// browsers cannot attach a real one; N > 1 exercises local-seat hot-join.
function syntheticPads(): readonly GamepadSample[] | null {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("gamepad");
  if (param === null) return null;
  const count = Math.max(1, Math.min(4, Number(param) || 1));
  return Array.from({ length: count }, () => ({ axes: [0, 0], buttons: [{ pressed: true, value: 1 }], connected: true }));
}

/** Poll browser gamepads and feed semantic actions into the shell tracker. */
export function GamepadSource({
  tracker,
  bindings,
  analogRef,
  input,
  feel,
  seats,
  onSeatJoin,
  seatsActive,
}: {
  tracker: ActionStateTracker<string>;
  bindings: ActionCodesMap;
  analogRef: { current: Readonly<Record<string, number>> | null };
  input: InputSnapshot;
  /** Game-level pad feel (`defineGame({ gamepad })`); unset keeps the shell defaults. */
  feel?: GamepadFeelConfig;
  /** Local seats; pads claimed by a seat other than the primary publish to that seat's input. */
  seats?: LocalPlayers;
  /** A pad just opened a new seat; the shell spawns its player here. */
  onSeatJoin?: (slot: LocalPlayerSlot) => void;
  /** False while play controls are gated (menus, orientation lock): seats publish nothing held. */
  seatsActive?: () => boolean;
}) {
  const poll = useRef(emptyGamepadPoll());
  const padBindings = useRef(gamepadCodes(bindings));
  const options = useMemo(() => gamepadFeelOptions(feel), [feel]);
  const synthetic = useMemo(syntheticPads, []);
  useEffect(() => {
    const next = gamepadCodes(bindings);
    rebindGamepadPoll(poll.current, padBindings.current, next, tracker);
    padBindings.current = next;
  }, [bindings, tracker]);

  useEffect(() => {
    const inputWithRumble = input as unknown as {
      rumble?: (userId: string, options: { strong: number; weak: number; ms: number }) => Promise<boolean>;
    };
    inputWithRumble.rumble = async (userId: string, options: { strong: number; weak: number; ms: number }) => {
      const pads = browserPads();
      const actuator = actuatorOf(pads[padIndexForUser(userId, seats, pads)]);
      if (actuator === null) return false;
      try {
        await actuator.playEffect("dual-rumble", {
          duration: options.ms,
          strongMagnitude: options.strong,
          weakMagnitude: options.weak,
        });
        return true;
      } catch {
        return false;
      }
    };
    return () => {
      delete inputWithRumble.rumble;
    };
  }, [input, seats]);

  const hapticStates = useRef(new Map<number, PadHapticState>());
  const driveHaptics = (dt: number, pads: ArrayLike<GamepadSample | null>) => {
    if (seats === undefined) return;
    const nowMs = performance.now();
    const slots = seats.slots();
    for (let index = 0; index < slots.length; index += 1) {
      const level = input.haptics(slots[index]!.userId).mix(dt);
      const padIndex = padIndexForUser(slots[index]!.userId, seats, pads);
      const actuator = actuatorOf(pads[padIndex]);
      if (actuator === null) continue;
      let state = hapticStates.current.get(padIndex);
      if (state === undefined) {
        state = emptyPadHapticState();
        hapticStates.current.set(padIndex, state);
      }
      const command = stepPadHaptics(state, level, nowMs);
      if (command === "play") {
        actuator
          .playEffect("dual-rumble", { duration: PAD_HAPTIC_EFFECT_MS, strongMagnitude: level.strong, weakMagnitude: level.weak })
          .catch(ignore);
      } else if (command === "reset") {
        actuator.reset?.().catch(ignore);
      }
    }
  };

  const route = useRef(emptyGamepadRoute());
  const seatFrame = useRef<GamepadFrame>({ held: [], analog: {} });
  const seatsPublished = useRef(new Set<string>());
  useFrame((_state, dt) => {
    const pads: ArrayLike<GamepadSample | null> = synthetic ?? browserPads();
    driveHaptics(dt, pads);
    if (seats === undefined) {
      analogRef.current = stepGamepadPoll(poll.current, pads, padBindings.current, options, tracker, analogRef.current);
      return;
    }
    const routed = routeGamepads(pads, seats, route.current);
    for (const slot of routed.joined) onSeatJoin?.(slot);
    analogRef.current = stepGamepadPoll(poll.current, routed.primary, padBindings.current, options, tracker, analogRef.current);
    const active = seatsActive?.() ?? true;
    const published = seatsPublished.current;
    for (const slotId of published) {
      let routedNow = false;
      for (let index = 0; index < routed.seatCount; index += 1) routedNow ||= routed.seats[index]!.slotId === slotId;
      if (routedNow && active) continue;
      const seat = seats.local(slotId);
      seat?.input.publish(NO_HELD);
      seat?.input.publishAnalog(null);
      published.delete(slotId);
    }
    if (!active) return;
    for (let index = 0; index < routed.seatCount; index += 1) {
      const { slotId, pad } = routed.seats[index]!;
      const seat = seats.local(slotId);
      if (seat === null) continue;
      const frame = resolveGamepadFrame(pad, padBindings.current, options, seatFrame.current);
      seat.input.publish(frame.held);
      seat.input.publishAnalog(hasAnalog(frame.analog) ? frame.analog : null);
      published.add(slotId);
    }
  });
  return null;
}

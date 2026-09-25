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
export { mergeGamepadFrame, mergeGamepadInput } from "./gamepadMerge";

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
      const pads = typeof navigator === "undefined" || navigator.getGamepads === undefined ? [] : navigator.getGamepads();
      const requested = /^gamepad:(\d+)$/.exec(userId)?.[1];
      const pad = (requested === undefined ? Array.from(pads).find((candidate) => candidate?.connected) : pads[Number(requested)]) ?? null;
      const actuator = pad?.vibrationActuator;
      if (actuator === undefined) return false;
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
  }, [input]);

  const route = useRef(emptyGamepadRoute());
  const seatFrame = useRef<GamepadFrame>({ held: [], analog: {} });
  const seatsPublished = useRef(new Set<string>());
  useFrame(() => {
    const pads: ArrayLike<GamepadSample | null> =
      synthetic ?? (typeof navigator === "undefined" || navigator.getGamepads === undefined ? [] : navigator.getGamepads());
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

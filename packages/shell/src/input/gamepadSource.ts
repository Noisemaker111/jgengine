import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

import { gamepadFeelOptions, type GamepadFeelConfig, type GamepadSample } from "@jgengine/core/input/gamepadModel";
import type { ActionCodesMap, ActionStateTracker } from "@jgengine/core/input/actionBindings";
import type { InputSnapshot } from "@jgengine/core/runtime/inputSnapshot";
import { emptyGamepadPoll, gamepadCodes, rebindGamepadPoll, stepGamepadPoll } from "./gamepadPoll";
export { mergeGamepadFrame, mergeGamepadInput } from "./gamepadMerge";

const SYNTHETIC_PAD: GamepadSample = { axes: [0, 0], buttons: [{ pressed: true, value: 1 }], connected: true };

function syntheticPads(): readonly GamepadSample[] | null {
  if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("gamepad")) return null;
  return [SYNTHETIC_PAD];
}

/** Poll browser gamepads and feed semantic actions into the shell tracker. */
export function GamepadSource({
  tracker,
  bindings,
  analogRef,
  input,
  feel,
}: {
  tracker: ActionStateTracker<string>;
  bindings: ActionCodesMap;
  analogRef: { current: Readonly<Record<string, number>> | null };
  input: InputSnapshot;
  /** Game-level pad feel (`defineGame({ gamepad })`); unset keeps the shell defaults. */
  feel?: GamepadFeelConfig;
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

  useFrame(() => {
    const pads: ArrayLike<GamepadSample | null> =
      synthetic ?? (typeof navigator === "undefined" || navigator.getGamepads === undefined ? [] : navigator.getGamepads());
    analogRef.current = stepGamepadPoll(poll.current, pads, padBindings.current, options, tracker, analogRef.current);
  });
  return null;
}

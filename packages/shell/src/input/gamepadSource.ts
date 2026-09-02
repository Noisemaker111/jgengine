import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";

import {
  resolveGamepadFrame,
  type GamepadBindings,
  type GamepadFrame,
  type GamepadSnapshot,
} from "@jgengine/core/input/gamepadModel";
import type { ActionCodesMap, ActionStateTracker } from "@jgengine/core/input/actionBindings";
import type { InputSnapshot } from "@jgengine/core/runtime/inputSnapshot";
import { mergeGamepadInput } from "./gamepadMerge";
export { mergeGamepadFrame, mergeGamepadInput } from "./gamepadMerge";

function snapshotOf(gamepad: Gamepad): GamepadSnapshot {
  return {
    id: gamepad.id,
    axes: Array.from(gamepad.axes),
    buttons: Array.from(gamepad.buttons, (button) => ({ pressed: button.pressed, value: button.value })),
    connected: gamepad.connected,
  };
}

function gamepadCodes(bindings: ActionCodesMap): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const [action, config] of Object.entries(bindings)) {
    const codes = Array.isArray(config)
      ? config
      : [...((config as { hold?: readonly string[] }).hold ?? []), ...((config as { toggle?: readonly string[] }).toggle ?? [])];
    const padCodes = codes.filter((code) => code.startsWith("pad:") || code.startsWith("padaxis:"));
    if (padCodes.length > 0) result.set(action, padCodes);
  }
  return result;
}

function syncTracker(tracker: ActionStateTracker<string>, bindings: Map<string, string[]>, previous: Set<string>, next: Set<string>) {
  for (const [action, codes] of bindings) {
    for (const code of codes) {
      const wasDown = previous.has(action);
      const isDown = next.has(action);
      if (isDown && !wasDown) tracker.handleDown(code);
      if (!isDown && wasDown) tracker.handleUp(code);
    }
  }
}

function syntheticSnapshot(): GamepadSnapshot | null {
  if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("gamepad")) return null;
  return { id: "Synthetic Gamepad", axes: [0, 0], buttons: [{ pressed: true, value: 1 }], connected: true };
}

/** Poll browser gamepads and feed semantic actions into the shell tracker. */
export function GamepadSource({
  tracker,
  bindings,
  analogRef,
  input,
}: {
  tracker: ActionStateTracker<string>;
  bindings: ActionCodesMap;
  analogRef: { current: Readonly<Record<string, number>> | null };
  input: InputSnapshot;
}) {
  const previousHeld = useRef<Set<string>>(new Set());
  const previousAnalog = useRef<Set<string>>(new Set());
  const padBindings = useRef(gamepadCodes(bindings));
  useEffect(() => {
    padBindings.current = gamepadCodes(bindings);
    previousHeld.current.clear();
    previousAnalog.current.clear();
    tracker.reset();
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
    const synthetic = syntheticSnapshot();
    const pads = synthetic === null
      ? (typeof navigator === "undefined" || navigator.getGamepads === undefined ? [] : navigator.getGamepads())
      : [synthetic];
    const frames: GamepadFrame[] = [];
    for (let index = 0; index < pads.length; index += 1) {
      const pad = pads[index];
      if (pad !== null && pad !== undefined) {
        frames.push(resolveGamepadFrame(snapshotOf(pad as Gamepad), padBindingsToGamepad(padBindings.current), {
          deadzone: { kind: "axial", inner: 0.12, outer: 0.95 },
        }));
      }
    }
    const baseAnalog = { ...(analogRef.current ?? {}) };
    for (const action of previousAnalog.current) delete baseAnalog[action];
    const merged = mergeGamepadInput(frames, { held: [], analog: baseAnalog });
    const nextHeld = new Set(merged.held);
    syncTracker(tracker, padBindings.current, previousHeld.current, nextHeld);
    previousHeld.current = nextHeld;
    analogRef.current = Object.keys(merged.analog).length === 0 ? null : merged.analog;
    previousAnalog.current = new Set(Object.keys(mergeGamepadInput(frames).analog));
  });
  return null;
}

function padBindingsToGamepad(bindings: Map<string, string[]>): GamepadBindings {
  return Object.fromEntries(bindings.entries()) as GamepadBindings;
}

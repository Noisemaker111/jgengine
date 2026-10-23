import type { HapticPulse } from "@jgengine/core/input/haptics";

/** Where a pulse actually landed: a gamepad, the device's own motor, or nowhere. */
export type HapticsSink = "gamepad" | "vibration" | "none";

/** The browser reach of {@link createHapticsRoute}; injected so the route runs headless. */
export interface HapticsRouteOptions {
  /** Connected pads. Default `navigator.getGamepads`. */
  gamepads?(): ArrayLike<Gamepad | null>;
  /** Device vibration, called with the pulse length in ms. Default `navigator.vibrate`; `null` for a device without one. */
  vibrate?: ((ms: number) => void) | null;
  /** Where `gamepadconnected`/`gamepaddisconnected` arrive. Default `window`; `null` reads pads per pulse. */
  events?: Pick<Window, "addEventListener" | "removeEventListener"> | null;
}

/** Route haptic pulses to whatever the player can feel them on. */
export interface HapticsRoute {
  /** Send one pulse: the gamepad if a pad is connected, else the phone's motor, else nothing. */
  deliver(pulse: HapticPulse): HapticsSink;
  /** Drop the connection listeners. Safe twice. */
  dispose(): void;
}

function browserPads(): ArrayLike<Gamepad | null> {
  return typeof navigator === "undefined" || navigator.getGamepads === undefined ? [] : navigator.getGamepads();
}

function hasVibratingPad(pads: ArrayLike<Gamepad | null>): boolean {
  for (let index = 0; index < pads.length; index += 1) {
    const pad = pads[index];
    if (pad !== null && pad !== undefined && pad.connected && pad.vibrationActuator != null) return true;
  }
  return false;
}

function browserVibrate(): ((ms: number) => void) | null {
  if (typeof navigator === "undefined" || navigator.vibrate === undefined) return null;
  return (ms) => {
    navigator.vibrate(ms);
  };
}

function browserEvents(): Pick<Window, "addEventListener" | "removeEventListener"> | null {
  return typeof window === "undefined" ? null : window;
}

/**
 * One pulse in, whichever motor the player has: a connected gamepad takes it through the haptic
 * channels the gamepad loop already drives, and a phone with no pad falls back to
 * `navigator.vibrate`. Pad presence is cached and refreshed on connection events, so a hit never
 * asks the browser for its pad list. Reduced motion does not silence this: see `eventFeedback`.
 *
 * @capability haptics-route send a feedback pulse to the gamepad when one is connected, else to the phone's vibration motor
 */
export function createHapticsRoute(
  pad: (pulse: HapticPulse) => void,
  options: HapticsRouteOptions = {},
): HapticsRoute {
  const readPads = options.gamepads ?? browserPads;
  const vibrate = options.vibrate === undefined ? browserVibrate() : options.vibrate;
  const events = options.events === undefined ? browserEvents() : options.events;
  let padPresent = hasVibratingPad(readPads());
  const refresh = (): void => {
    padPresent = hasVibratingPad(readPads());
  };
  const readPerPulse = events === null;
  events?.addEventListener("gamepadconnected", refresh);
  events?.addEventListener("gamepaddisconnected", refresh);

  return {
    deliver(pulse) {
      if (readPerPulse) refresh();
      if (padPresent) {
        pad(pulse);
        return "gamepad";
      }
      if (vibrate === null || Math.max(0, pulse.ms) === 0) return "none";
      vibrate(Math.round(pulse.ms));
      return "vibration";
    },
    dispose() {
      events?.removeEventListener("gamepadconnected", refresh);
      events?.removeEventListener("gamepaddisconnected", refresh);
    },
  };
}

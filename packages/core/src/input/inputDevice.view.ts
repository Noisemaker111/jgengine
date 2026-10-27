import { useSyncExternalStore } from "react";

import { bindingLabel, primaryActionCodes, type ActionCodesMap } from "@jgengine/core/input/actionBindings";
import type { GamepadGlyphName } from "@jgengine/core/input/gamepadModel";

/** The device the player last used: drives which glyph a prompt shows. */
export type InputDevice = "keyboard" | "gamepad" | "touch";

let current: InputDevice | null = null;
const listeners = new Set<() => void>();
let detach: (() => void) | null = null;

function initialDevice(): InputDevice {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "keyboard";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const fine = window.matchMedia("(any-pointer: fine)").matches;
  return coarse && !fine ? "touch" : "keyboard";
}

/** Report the device the player just used. The shell's own input calls it; a game rarely needs to. */
export function setInputDevice(device: InputDevice): void {
  if (current === device) return;
  current = device;
  for (const listener of listeners) listener();
}

/** The device the player last used, without subscribing. */
export function getInputDevice(): InputDevice {
  if (current === null) current = initialDevice();
  return current;
}

function padActive(): boolean {
  const pads = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (pad === null || !pad.connected) continue;
    if (pad.buttons.some((button) => button.pressed)) return true;
    if (pad.axes.some((axis) => Math.abs(axis) > 0.5)) return true;
  }
  return false;
}

function attach(): () => void {
  if (typeof window === "undefined") return () => undefined;
  let frame = 0;
  let padsConnected = 0;
  const watchPads = () => {
    frame = 0;
    if (padsConnected <= 0) return;
    if (current !== "gamepad" && padActive()) setInputDevice("gamepad");
    frame = window.requestAnimationFrame(watchPads);
  };
  const onKey = (event: KeyboardEvent) => {
    if (!event.repeat) setInputDevice("keyboard");
  };
  const onPointer = (event: PointerEvent) => setInputDevice(event.pointerType === "touch" || event.pointerType === "pen" ? "touch" : "keyboard");
  const onPadConnected = () => {
    padsConnected += 1;
    if (frame === 0) frame = window.requestAnimationFrame(watchPads);
  };
  const onPadDisconnected = () => {
    padsConnected = Math.max(0, padsConnected - 1);
  };
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("pointerdown", onPointer, true);
  window.addEventListener("gamepadconnected", onPadConnected);
  window.addEventListener("gamepaddisconnected", onPadDisconnected);
  const pads = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
  for (const pad of pads) if (pad !== null && pad.connected) onPadConnected();
  return () => {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("pointerdown", onPointer, true);
    window.removeEventListener("gamepadconnected", onPadConnected);
    window.removeEventListener("gamepaddisconnected", onPadDisconnected);
    if (frame !== 0) window.cancelAnimationFrame(frame);
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (detach === null) detach = attach();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && detach !== null) {
      detach();
      detach = null;
    }
  };
}

/**
 * The device the player is using right now — keyboard/mouse, gamepad or touch — switching the moment
 * they touch another one. Prompts use it to show `E`, `A` or a tap target.
 *
 * @capability input-device which device the player last used (keyboard, gamepad, touch), live, for device-correct prompts
 */
export function useInputDevice(): InputDevice {
  return useSyncExternalStore(subscribe, getInputDevice, () => "keyboard");
}

function isPadCode(code: string): boolean {
  return code.startsWith("pad:") || code.startsWith("padaxis:");
}

function codesFor(map: ActionCodesMap, action: string): readonly string[] {
  const codes = map[action];
  return codes === undefined ? [] : primaryActionCodes(codes);
}

/**
 * The glyph to show for `action` on `device`: the first keyboard/mouse code on keyboard, the first pad
 * code on gamepad (in `glyphSet`'s names), `"Tap"` on touch. Null when nothing is bound for that device.
 *
 * @capability action-glyph the key, pad button or tap label for an action on the device in use
 */
export function actionGlyph(
  map: ActionCodesMap,
  action: string,
  device: InputDevice,
  glyphSet: GamepadGlyphName = "xbox",
): string | null {
  if (device === "touch") return "Tap";
  const codes = codesFor(map, action);
  const code = codes.find((entry) => (device === "gamepad" ? isPadCode(entry) : !isPadCode(entry)));
  return code === undefined ? null : bindingLabel(code, glyphSet);
}

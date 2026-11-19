import type { GamepadFrame } from "@jgengine/core/input/gamepadModel";

export interface GamepadInputFrame {
  held: readonly string[];
  analog: Readonly<Record<string, number>>;
}

export function mergeGamepadFrame(base: GamepadInputFrame, gamepad: GamepadFrame): GamepadInputFrame {
  const held = [...new Set([...base.held, ...gamepad.held])];
  const analog = { ...base.analog };
  for (const [action, value] of Object.entries(gamepad.analog)) analog[action] = Math.max(analog[action] ?? 0, value);
  return { held, analog };
}

/** Pure reducer used by the shell and synthetic gamepad tests. */
export function mergeGamepadInput(
  frames: readonly GamepadFrame[],
  base: GamepadInputFrame = { held: [], analog: {} },
): GamepadInputFrame {
  return frames.reduce(mergeGamepadFrame, base);
}

import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  num1: ["Digit1", "Numpad1"],
  num2: ["Digit2", "Numpad2"],
  num3: ["Digit3", "Numpad3"],
  num4: ["Digit4", "Numpad4"],
  num5: ["Digit5", "Numpad5"],
  num6: ["Digit6", "Numpad6"],
  num7: ["Digit7", "Numpad7"],
  num8: ["Digit8", "Numpad8"],
  num9: ["Digit9", "Numpad9"],
  erase: ["Backspace", "Delete", "Digit0", "Numpad0"],
  toggleNotes: ["KeyN"],
  hint: ["KeyH"],
  undo: ["KeyU", "KeyZ"],
  toggleErrors: ["KeyE"],
  newGame: ["KeyR"],
  daily: ["KeyD"],
  navUp: ["ArrowUp"],
  navDown: ["ArrowDown"],
  navLeft: ["ArrowLeft"],
  navRight: ["ArrowRight"],
};

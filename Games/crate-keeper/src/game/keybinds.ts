import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  undo: ["KeyZ", "Backspace"],
  restart: ["KeyR"],
  nextLevel: ["KeyN", "Enter"],
  select: ["Escape", "KeyM"],
};

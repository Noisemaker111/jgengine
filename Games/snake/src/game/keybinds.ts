import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  steerUp: ["ArrowUp", "KeyW"],
  steerDown: ["ArrowDown", "KeyS"],
  steerLeft: ["ArrowLeft", "KeyA"],
  steerRight: ["ArrowRight", "KeyD"],
  confirm: ["Space", "Enter"],
  pauseToggle: ["KeyP", "Escape"],
  restart: ["KeyR"],
  toggleMode: ["KeyM"],
};

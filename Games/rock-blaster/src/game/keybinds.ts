import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  rotateLeft: ["ArrowLeft", "KeyA"],
  rotateRight: ["ArrowRight", "KeyD"],
  thrust: ["ArrowUp", "KeyW"],
  fire: ["Space"],
  hyperspace: ["ShiftLeft", "ShiftRight"],
  startGame: ["Space", "Enter"],
  pauseToggle: ["KeyP", "Escape"],
  restart: ["KeyR"],
};

import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  sprint: ["ShiftLeft", "ShiftRight"],
  interact: ["KeyE"],
  toggleMap: ["KeyM"],
  restartRun: ["KeyR"],
  startRun: ["Enter"],
};

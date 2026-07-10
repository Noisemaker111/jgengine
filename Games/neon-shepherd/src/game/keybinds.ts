import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  gatherPulse: ["Space"],
  holdHerd: ["ShiftLeft", "ShiftRight"],
  toggleMap: ["KeyM"],
  restart: ["KeyR"],
  start: ["Enter"],
};

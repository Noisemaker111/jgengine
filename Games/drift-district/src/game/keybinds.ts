import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  throttle: ["KeyW", "ArrowUp"],
  brake: ["KeyS", "ArrowDown"],
  steerLeft: ["KeyA", "ArrowLeft"],
  steerRight: ["KeyD", "ArrowRight"],
  handbrake: ["Space"],
  boost: ["ShiftLeft", "ShiftRight"],
  restart: ["KeyR"],
  confirm: ["Enter"],
};

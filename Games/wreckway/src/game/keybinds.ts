import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  throttle: ["KeyW", "ArrowUp"],
  brake: ["KeyS", "ArrowDown"],
  steerLeft: ["KeyA", "ArrowLeft"],
  steerRight: ["KeyD", "ArrowRight"],
  jumpHop: ["Space"],
  plowBrace: ["ShiftLeft", "ShiftRight"],
  restart: ["KeyR"],
  startRun: ["Enter"],
};

import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  throttle: ["KeyW", "ArrowUp"],
  brake: ["KeyS", "ArrowDown"],
  steerLeft: ["KeyA", "ArrowLeft"],
  steerRight: ["KeyD", "ArrowRight"],
  jumpHop: ["Space"],
  handbrake: ["KeyX"],
  plowBrace: ["ShiftLeft", "ShiftRight"],
  salvageSwap: { hold: ["KeyE"] },
  restart: ["KeyR"],
  startRun: ["Enter"],
  pauseRun: ["KeyP"],
};

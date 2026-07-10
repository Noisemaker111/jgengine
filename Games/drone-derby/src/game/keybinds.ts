import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  throttleUp: ["KeyW"],
  throttleDown: ["KeyS"],
  yawLeft: ["KeyA"],
  yawRight: ["KeyD"],
  pitchForward: ["ArrowUp"],
  pitchBack: ["ArrowDown"],
  strafeLeft: ["ArrowLeft"],
  strafeRight: ["ArrowRight"],
  boost: ["Space"],
  chargeToggle: ["KeyE"],
  restart: ["KeyR"],
  startRace: ["Enter"],
  courseShort: ["Digit1"],
  courseTechnical: ["Digit2"],
  courseEndurance: ["Digit3"],
};

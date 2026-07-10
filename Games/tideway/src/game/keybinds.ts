import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  throttleUp: ["KeyW"],
  throttleReverse: ["KeyS"],
  rudderLeft: ["KeyA"],
  rudderRight: ["KeyD"],
  brakeBrace: ["Space"],
  restartRace: ["KeyR"],
  startRace: ["Enter"],
};

export type TidewayAction = keyof typeof keybinds;

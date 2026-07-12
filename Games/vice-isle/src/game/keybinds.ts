import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  jump: ["Space"],
  sprint: ["ShiftLeft"],
  interact: ["KeyE"],
  fire: { hold: ["mouse0"], repeatMs: 60 },
  throwGrenade: ["KeyG"],
  useMedkit: ["KeyQ"],
  exitVehicle: ["KeyF"],
  selectSlot1: ["Digit1"],
  selectSlot2: ["Digit2"],
  selectSlot3: ["Digit3"],
  selectSlot4: ["Digit4"],
};

import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  jump: ["Space"],
  sprint: ["ShiftLeft"],
  interact: ["KeyE"],
  fire: { hold: ["mouse0"], repeatMs: 40 },
  selectSlot1: ["Digit1"],
  selectSlot2: ["Digit2"],
  selectSlot3: ["Digit3"],
  throwGrenade: ["KeyG"],
  useMedkit: ["KeyQ"],
  reload: ["KeyR"],
};

import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  jump: ["Space"],
  sprint: ["ShiftLeft"],
  crouch: { hold: ["KeyC"] },
  interact: ["KeyE"],
  fire: { hold: ["mouse0"], repeatMs: 30 },
  aim: { hold: ["mouse2"] },
  reload: ["KeyR"],
  throwGrenade: ["KeyG"],
  useHealthVial: ["KeyQ"],
  selectSlot1: ["Digit1"],
  selectSlot2: ["Digit2"],
  selectSlot3: ["Digit3"],
  selectSlot4: ["Digit4"],
  openSkills: ["KeyK"],
};

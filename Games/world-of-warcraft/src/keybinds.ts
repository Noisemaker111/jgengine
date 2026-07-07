import { hotbarSlotBindings, type ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  jump: ["Space"],
  interact: ["KeyE"],
  tabTarget: ["Tab"],
  clearTarget: ["Escape"],
  useAbility: ["mouse0"],
  openBackpack: ["KeyB"],
  openCharacter: ["KeyC"],
  openAbilities: ["KeyK"],
  openEmotes: ["KeyN"],
  swapControl: ["KeyX"],
  shapeshift: ["KeyF"],
  ...hotbarSlotBindings(9),
};

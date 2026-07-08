import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW", "ArrowUp"],
  moveBack: ["KeyS", "ArrowDown"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  turnLeft: ["ArrowLeft", "KeyQ"],
  turnRight: ["ArrowRight", "KeyE"],
  fire: ["Space", "KeyF"],
  restart: ["KeyR"],
};

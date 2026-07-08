import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  shiftLeft: ["ArrowLeft"],
  shiftRight: ["ArrowRight"],
  rotateCw: ["ArrowUp", "KeyX"],
  rotateCcw: ["KeyZ"],
  softDrop: ["ArrowDown"],
  hardDrop: ["Space"],
  hold: ["KeyC"],
  restart: ["KeyR"],
};

import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  jump: ["Space"],
  interact: ["KeyE"],
  // Selection-bookmark recall (issue #916): a numbered control group and the
  // non-numbered "home" bookmark, each re-centering the camera on recall.
  recallGroup1: ["Digit1"],
  recallHome: ["KeyH"],
};

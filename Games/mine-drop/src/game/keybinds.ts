import { type ActionCodesMap } from "@jgengine/core/input/actionBindings";

// First-person feet + the coordinated-leap ritual. Space is a casual hop; the
// board only opens on a called LEAP (KeyF) so the whole crew commits together.
export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  jump: ["Space"],
  sprint: ["ShiftLeft"],
  leap: ["KeyF"],
  flag: ["KeyQ"],
  restart: ["KeyR"],
};

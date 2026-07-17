import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

/** RTS bindings. No movement actions are bound on purpose — there is no avatar to walk; the "rts"
 * camera rig owns WASD/arrow panning, edge-scroll, and zoom. `attackMove` arms the next order. */
export const keybinds: ActionCodesMap = {
  attackMove: ["KeyA"],
  trainPeasant: ["KeyE"],
  trainFootman: ["KeyF"],
  heroAbility: ["KeyQ"],
};

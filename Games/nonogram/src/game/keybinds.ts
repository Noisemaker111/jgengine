import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

// HUD-only puzzle: none of these are reserved shell actions, so each fires a
// command of the same name.
export const keybinds: ActionCodesMap = {
  toggleMode: ["KeyF"],
  undo: ["KeyZ"],
  clearBoard: ["KeyC"],
  toggleMistakes: ["KeyX"],
  openMenu: ["Escape", "KeyM"],
};

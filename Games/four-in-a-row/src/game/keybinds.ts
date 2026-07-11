import { type ActionCodesMap } from "@jgengine/core/input/actionBindings";

/** Digit 1..7 drop into that column; R rematches; U undoes. No reserved action names. */
export const keybinds: ActionCodesMap = {
  dropColumn1: ["Digit1"],
  dropColumn2: ["Digit2"],
  dropColumn3: ["Digit3"],
  dropColumn4: ["Digit4"],
  dropColumn5: ["Digit5"],
  dropColumn6: ["Digit6"],
  dropColumn7: ["Digit7"],
  rematch: ["KeyR"],
  undoMove: ["KeyU"],
};

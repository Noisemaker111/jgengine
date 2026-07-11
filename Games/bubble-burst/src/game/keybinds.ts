import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  aimLeft: { hold: ["ArrowLeft", "KeyA"], repeatMs: 24 },
  aimRight: { hold: ["ArrowRight", "KeyD"], repeatMs: 24 },
  fire: ["Space"],
  swap: ["KeyX"],
  restart: ["KeyR"],
};

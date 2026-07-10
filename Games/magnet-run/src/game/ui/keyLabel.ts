import { actionLabel } from "@jgengine/core/input/actionBindings";
import { keybinds } from "../keybinds";

export function keyLabel(action: string): string {
  return actionLabel(keybinds, action) ?? "?";
}

import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";
import { DEFAULT_WALK_CODES, defineSystem } from "@jgengine/shell/gameKit";
import { openDoor, shoot, toggleInventory } from "./myGame";

// Keys are data. Players remap them in Settings → Controls.
export const input = {
  ...DEFAULT_WALK_CODES, // WASD + Space: the engine walks and jumps
  sprint: ["ShiftLeft"], // the engine runs
  pause: ["Escape", "KeyP"], // the game-flow system pauses
  interact: ["KeyE"],
  inventory: ["KeyI", "Tab"],
  fire: { hold: ["mouse0", "KeyF"], repeatMs: 120, locked: true }, // can't be remapped
} satisfies ActionCodesMap;

// Each action runs the command with its name. No keys in here.
export const controls = defineSystem({
  id: "controls",
  create(ctx) {
    ctx.game.commands.define("interact", { apply: openDoor });
    ctx.game.commands.define("inventory", { apply: toggleInventory });
    ctx.game.commands.define("fire", { apply: shoot });
  },
});

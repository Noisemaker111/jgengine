import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { Tool } from "./game/catalog";
import { demolish, initCity, pointerAction, setTool, type PointerInput } from "./game/city/state";

const TOOL_COMMANDS: ReadonlyArray<[string, Tool]> = [
  ["toolSelect", "select"],
  ["toolDemolish", "demolish"],
  ["toolHousing", "housing"],
  ["toolWork", "work"],
  ["toolCivic", "civic"],
  ["toolCulture", "culture"],
  ["toolMixed", "mixed"],
  ["toolPlaza", "plaza"],
];

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define("pauseToggle", {
    apply(state) {
      state.time.toggle();
    },
  });
  for (const [command, tool] of TOOL_COMMANDS) {
    ctx.game.commands.define(command, {
      apply(state) {
        setTool(state, tool);
      },
    });
  }
  ctx.game.commands.define<PointerInput>("site.pointer", {
    apply(state, input) {
      pointerAction(state, input);
    },
  });
  ctx.game.commands.define<{ id: string }>("site.demolish", {
    apply(state, input) {
      demolish(state, input.id);
    },
  });
  initCity(ctx);
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(_ctx: GameContext, _dt: number): void {}

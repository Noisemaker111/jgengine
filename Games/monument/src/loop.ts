import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { Building, Lens, Plaza, Tool } from "./game/catalog";
import {
  activeLens,
  captureHistory,
  demolish,
  growSibling,
  initCity,
  pointerAction,
  redoCity,
  setLens,
  setTool,
  undoCity,
  updateBuilding,
  updatePlaza,
  type PointerInput,
} from "./game/city/state";

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
  ctx.game.commands.define<{ id: string; patch: Partial<Building>; capture?: boolean }>("building.update", {
    apply(state, input) {
      if (input.capture === true) captureHistory(state);
      updateBuilding(state, input.id, input.patch);
    },
  });
  ctx.game.commands.define<{ id: string }>("building.duplicate", {
    apply(state, input) {
      growSibling(state, input.id);
    },
  });
  ctx.game.commands.define<{ id: string; patch: Partial<Plaza>; capture?: boolean }>("plaza.update", {
    apply(state, input) {
      if (input.capture === true) captureHistory(state);
      updatePlaza(state, input.id, input.patch);
    },
  });
  ctx.game.commands.define("cycleLens", {
    apply(state) {
      const order: Lens[] = ["material", "program", "structure", "daylight", "activity", "carbon"];
      const current = activeLens(state);
      setLens(state, order[(order.indexOf(current) + 1) % order.length]);
    },
  });
  ctx.game.commands.define<{ lens: Lens }>("site.lens", {
    apply(state, input) {
      setLens(state, input.lens);
    },
  });
  ctx.game.commands.define("undo", {
    apply(state) {
      undoCity(state);
    },
  });
  ctx.game.commands.define("redo", {
    apply(state) {
      redoCity(state);
    },
  });
  initCity(ctx);
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(_ctx: GameContext, _dt: number): void {}
